/**
 * Логирование
 * @param {string} value - значение для логирования
 * @param {string} name - название файла лога
 */
function addLog(value, name) {
    var sLogName = name
    if (sLogName == undefined) {
        sLogName = "load_sc_from_typical_adapt"
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
    return OpenCodeLib(sc_path)
}

/**
 * Получить библиотеку.
 * Создание завершенного курса из тренинга SkillCup
 * @returns {XmElem}
 */
function getLearningLib() {
    var learning_path = 'x-local://wt/web/custom_projects/libs/learning_lib.js'
    return OpenCodeLib(learning_path)
}

/**
 * Получить библиотеку для работы с адаптациями
 * @returns {XmElem}
 */
function getAdaptationLib() {
    var adaptation_path = 'x-local://wt/web/custom_projects/razum_common/'
    return OpenCodeLib(adaptation_path + 'razum_common_lib.js')
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

    // получение активностей
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
        if (!course.success) {
            continue
        }

        addLog(activity.id + " " + activity.name)
        addLog(activity.object_id + " " + course.code + " " + course.name)

        res = ADAPTATION.loadScLearning(adaptation.person_id, course.code, libs)
        addLog(tools.object_to_text(res, 'json'))
    }
}

/**
 * Получает уникальные номера лиц из базы данных.
 * @param {object} lib - Объект библиотеки для выполнения запросов к БД.
 * @returns {object} Результат выполнения SQL-запроса.
 */
//function getPersons(lib) {
//    var query = (
//        "select distinct p.PERSON_NUMBER AS code \n" +
//        "FROM stage.bi_1c_employee_registration as e \n" +
//        "left join stage.bi_1c_persons p on e.PERSON_REF_ID = p.REF_ID \n" +
//        "where p.PERSON_NUMBER is not null"
//    )
//
//    return lib.optXExec(query, 'corecpu')
//}

/**
 * Извлекает коды, начинающиеся с "SC_", из списка задач.
 * @param {object} tasks - Список объектов задач для обработки.
 * @returns {object} Объект с уникальными кодами "SC_" в качестве ключей.
 */
function getScLearnings(res, tasks) {
    var task, code
    for (task in tasks) {
        try {
            code = String(task.object_id.ForeignElem.code)
        } catch (err) {
            continue
        }

        if ( !StrBegins(code, "SC_") ) {
            continue
        }

        res[code] = true
    }

    return res
}

/**
 * Получает sc-тренинги из адаптаций.
 * @param {array} ids - идентификаторы типовых адаптаций.
 * @returns {object} Объект с уникальными ID sc-тренингов.
 */
function getLearnings(ids) {
    var result = {}

    var id, tasks
    for (id in ids) {
        card = tools.open_doc(id) // открываем адаптацию
        if (card == undefined) {
            continue
        }

        // получаем все курсы из адаптации
        tasks = ArraySelectByKey(card.TopElem.tasks, 'learning', 'type')

        // аккумулируем уникальные идентификаторы sc-тренингов
        result = getScLearnings(result, tasks)
    }

    return result
}

function loadPersonSkillCup(person, learnings, settings) {
    var lib = settings.libs.adaptation

    var code, res
    for (code in learnings) {
        addLog(" ")
        addLog("Сотрудник: " + tools.object_to_text(person, "json"))
        addLog("Код sc курса: " + code)
        res = lib.loadScLearning(person.code, code, settings.libs)
        addLog(tools.object_to_text(res, "json"))
    }
}

/**
 * Получает список сотрудников из СДО.
 * @returns {Array<object>} Массив объектов сотрудников.
 */
function getPersonsFromLms() {
    var query = (
        "SELECT cs.id, cs.code, cs.fullname \n" +
        "FROM collaborators AS cs \n" +
        "LEFT JOIN positions AS ps ON ps.id = cs.position_id \n" +
        "WHERE cs.is_dismiss = 0  \n" +
        "AND ps.position_common_id in ( \n" +
            "6246751210782330255," +    // СП
            "624675121550118958" +      // ДМ
        ")"
    )

    return XQuery("sql: " + query)
}

/**
 * Загружает данные SkillCup для списка пользователей.
 * @param {object} settings - Настройки для получения списка пользователей.
 * @returns {void}
 */
function load(settings) {
    addLog("Получение списка сотрудников.")
    var persons = getPersonsFromLms()
    if (ArrayOptFirstElem(persons) == undefined) {
        return
    }

    addLog("Получение списка активностей.")
    var learnings = getLearnings(settings.programs)

    addLog("Обработка активностей по каждому сотруднику.")
    var person
    for (person in persons) {
        loadPersonSkillCup(person, learnings, settings)
    }
}




// entry point
try {
    addLog("begin")
    load({
        libs: {
            sc: getSkillCupLib(),
            learning: getLearningLib(),
            adaptation: getAdaptationLib(),
        },
        programs: [7231245838301082062],
    })
    addLog("end")
} catch (err) {
    addLog("ERROR: " + err)
}

