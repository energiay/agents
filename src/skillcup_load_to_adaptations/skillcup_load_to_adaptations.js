/**
 * Логирование
 * @param {string} value - значение для логирования
 * @param {string} name - название файла лога
 */
function addLog(value, name) {
    var sLogName = name
    if (sLogName == undefined) {
        sLogName = "skillcup_load_to_adaptations"
    }

    EnableLog(sLogName)
    LogEvent(sLogName, value)
}

/**
 * Получить библиотеку для работы с SkillCup
 * @returns {XmElem}
 */
function getSkillCupLib() {
    var sc_path = 'x-local://wt/web/custom_projects/libs/skill_cup_load_lib.js'
    return OpenCodeLib(sc_path).clear()
}

/**
 * Получить библиотеку.
 * Создание завершенного курса из тренинга SkillCup
 * @returns {XmElem}
 */
function getLearningLib() {
    var learning_path = 'x-local://wt/web/custom_projects/libs/learning_lib.js'
    return OpenCodeLib(learning_path).clear()
}

/**
 * Получить библиотеку для работы с адаптациями
 * @returns {XmElem}
 */
function getAdaptationLib() {
    var adaptation_path = 'x-local://wt/web/custom_projects/razum_common/'
    return OpenCodeLib(adaptation_path + 'razum_common_lib.js').clear()
}

/**
 * Получает список активностей Skill Cup
 * @returns {Array<Object>} Список активностей адаптаций.
 */
function getScActivitiesFromAdaptations() {
    var query = (
        "\n" +
        "SELECT \n" +
        "    ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS nums, \n" +
        "    crs.id, \n" +
        "    crs.person_id, \n" +
        "    person.code AS person_code, \n" +
        "    crs.person_fullname \n" +
        "FROM career_reserves AS crs \n" +
        "INNER JOIN collaborators AS person ON person.id=crs.person_id \n" +
        "WHERE crs.status = 'active' \n" +
        "ORDER BY nums DESC \n"
    )
    addLog(query)

    return XQuery("sql: " + query)
}

/**
 * Возвращает значение внешнего элемента по указанному полю
 * @param {Object} obj - Объект, содержащий внешний элемент
 * @param {string} field - Название поля для получения значения
 * @returns {string|null} - Значение поля или null, если элемент не найден
 */
function getForeign(obj, field) {
    var foreign = obj.OptForeignElem
    if (foreign == null) {
        return null
    }

    return foreign.GetOptProperty(field)
}

/**
 * Возвращает курс из кеша или добавляет его, если он отсутствует.
 * @param {Object} activity - Объект активности с идентификатором курса.
 * @returns {Object} - курс
 */
function getCourse(activity) {
    var id = activity.object_id
    if (COURSE_CACHE.GetOptProperty(String(id)) == undefined) {
        var name = getForeign(id, "name")
        var code = getForeign(id, "code")
        if (code == null) {
            addLog("warn: не найден object_id " + id)
        }

        COURSE_CACHE[String(id)] = {
            success: StrBegins(String(code), "SC_"),
            code: code,
            name: name,
        }
    }

    return COURSE_CACHE.GetOptProperty(String(id))
}

/**
 * Пытается открыть карточку документа по идентификатору.
 *
 * В случае успеха возвращает документ карточки.
 * Если возникает ошибка — возвращает `null`.
 *
 * @param {number|string} id - Идентификатор документа.
 * @returns {XmElem|null} Карточка документа, если успешно открыт, иначе `null`.
 */
function optOpenDoc(id) {
    try {
        return OpenDoc(UrlFromDocID(Int(id)))
    }
    catch(err) {}

    return null
}

/**
 * Устанавливает активности обучения для адаптации сотрудника
 * @param {Object} adaptation - Объект адаптации сотрудника
 * @param {number|string} adaptation.id - Идентификатор документа адаптации
 * @param {number|string} adaptation.person_id - Идентификатор сотрудника
 * @returns {void}
*/
function setActivities(adaptation) {
    var libs = {sc: SC, learning: LEARNING}

    var card = optOpenDoc(adaptation.id)
    if (card == null) {
        addLog("error: Не удалось открыть карточку адаптации: " + adaptation.id)
        return
    }

    var tasks = card.TopElem.tasks
    var where = "This.type == 'learning' && This.status != 'passed'"
    var activities = ArraySelect(tasks, where)
    if (ArrayOptFirstElem(activities) == undefined) {
        addLog("В адаптации отсутствуют активные курсы.")
        return
    }

    var activity, res, course
    for (activity in activities) {
        course = getCourse(activity)
        if (course.success == false) {
            continue
        }

        addLog("")
        addLog(activity.id + " " + activity.name)
        addLog(activity.object_id + " " + course.code + " " + course.name)

        res = ADAPTATION.loadScLearning(adaptation.person_id, course.code, libs)
        addLog(tools.object_to_text(res, 'json'))
    }
}

/**
 * Загрузка активностей SkillCup в адаптации
 * @returns {void}
*/
function loadScToAdaptations() {
    var adaptations = getScActivitiesFromAdaptations()
    if (ArrayOptFirstElem(adaptations) == undefined) {
        return
    }

    var length = String(ArrayOptFirstElem(adaptations).nums)
    var i = 0

    var adaptation
    for (adaptation in adaptations) {
        addLog("")
        addLog("")
        addLog("Обработано адаптаций: " + i + " из " + length)
        addLog("")
        addLog("")
        addLog("Адаптация: " + adaptation.id)
        addLog(adaptation.person_id + " " + adaptation.person_fullname)
        setActivities(adaptation)
        i++
    }

    addLog("")
    addLog("Обработано адаптаций: " + i)
}




// entry point
try {
    var SC = getSkillCupLib()
    var LEARNING = getLearningLib()
    var ADAPTATION = getAdaptationLib()
    var COURSE_CACHE = {}

    loadScToAdaptations()
} catch (err) {
    addLog("ERROR: " + err)
}
