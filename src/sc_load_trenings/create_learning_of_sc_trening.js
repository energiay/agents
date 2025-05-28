/**
 * Логирование
 * @param {string} value - значение для логирования
 * @param {string} name - название файла лога
 */
function addLog(value, name) {
    var sLogName = name
    if (sLogName == undefined) {
        sLogName = "sc_load_learnings_of_users"
    }

    EnableLog(sLogName)
    LogEvent(sLogName, value)
}

/**
 * Получить условие для глубины поиска (в днях)
 * @param {int} days
 * @return {string}
 */
function getDaysWhere(days) {
    if (days == "") {
        return ""
    }

    return (
        "stat.created_at >= CAST(DATEADD(DAY, -" + days + ", GETDATE()) AS DATE)"
    )
}

/**
 * Получить условие поиска по одному тренингу
 * @param {string} id
 * @return {string}
 */
function getTrainingWhere(id) {
    if (id == "") {
        return ""
    }

    return (
        "stat.id in ('" + id + "')"
    )
}

/**
 * Получить условие поиска по одному сотруднику
 * @param {string} code - таб№ сотрудника
 * @return {string}
 */
function getUserWhere(code) {
    if (code == "") {
        return ""
    }

    return (
        "users.username in ('" + code + "')"
    )
}

/**
 * Получить условия для выборки тренингов
 * @param {object} setting
 * @property {int} days - кол-во дней
 * @property {string} training_id - идентификатор тренинга в Skill Cup
 * @property {string} code - таб№ сотрудника
 * @return {string}
 */
function getWhere() {
    var where = []

    var days = getDaysWhere(setting.days)
    if (days != "") {
        where.push(days)
    }

    var training = getTrainingWhere(setting.training_id)
    if (training != "") {
        where.push(training)
    }

    var user = getUserWhere(setting.code)
    if (user != "") {
        where.push(user)
    }

    if (ArrayOptFirstElem(where) == undefined) {
        return ""
    }

    return "WHERE " + where.join("\nAND ")
}

/**
 * Получение SC тренингов
 * @return {array}
 */
function getWtTrainings(setting) {
    var where = getWhere(setting)

    var query = (
        "\n" +
        "SELECT \n" +
        "   users.username AS user_code,  \n" +
        "   stat.id  \n" +
        "FROM SC_Stats AS stat  \n" +
        "LEFT JOIN sc_users AS users ON users.id = stat.user_id  \n" +
        where
        // тестирование iTulinov
        //"WHERE stat.id = 'bb2c797d-05ef-46cc-9963-18817f1d8422' \n" +
        //"AND users.username = '413864'"
    )

    var data = SQL.optXExec(query, 'ars')

    return data
}

/**
 * Проверяет, являются ли все значения в объекте `settings` пустыми строками.
 * 
 * Использует метод `GetOptProperty` для безопасного доступа к значениям по ключам.
 * Возвращает `false`, если найдено хотя бы одно непустое значение.
 * 
 * @param {Object} settings
 * @returns {bool}
 */
function isEmptySetting(settings) {
    var field
    for (field in settings) {
        if (settings.GetOptProperty(field) != "") {
            return false
        }
    }

    return true
}

/**
 * Загрузка данных по одному тренингу конкретного пользователя
 * @param {string} username - Табельный номер сотрудника
 * @param {string} training - Код курса (например, "SC_...")
 * @param {boolean} force - true, обновить тренинг даже если он не обновлялся
 */
function loadLearning(person, training, force) {
    // загрузить данные из Skill Cup
    var response = SC.loadTrainingForUser(person, training)
    if (!response.success) {
        var msg = "Не удалось загрузить данные: "
        addLog(msg + tools.object_to_text(response, 'json'))
        return
    }

    addLog("response: " + tools.object_to_text(response, 'json'))

    // Создать/обновить карточку курса в WT
    var learning = LEARNING.learningOfSkillCup(person, response.data, force)
    if (!learning.success) {
        addLog(tools.object_to_text(learning, 'json'))
        return
    }

    addLog("learning: " + tools.object_to_text(learning, 'json'))

    // Проставить карточку курса в активность адаптации
    ADAPTATION.execCard(learning.card.TopElem)
    addLog("Тренинг загружен " + training + " " + person)

}

/**
 * Загрузка SkillCup курсов на основе данных из бд WTDB_lmsext001
 * @param {object} setting
 */
function loadFromLmsExt(setting) {
    if (isEmptySetting(setting)) {
        addLog(
            "Агент остановлен т.к. значения всех параметров пусты" +
            "(load_days, load_training, load_code)"
        )
        return
    }

    // получение SkillCup тренингов
    var trainings = getWtTrainings(setting)

    var training
    for (training in trainings) {
        loadLearning(training.user_code, training.id, false)
    }
}

/**
 * Получает список обучающих активностей Skill Cup из адаптаций.
 *
 * Выполняет SQL-запрос к таблицам `career_reserves`, `career_reserve` и `courses`
 * с фильтрацией по задачам типа `learning` и кодам курсов, начинающимся с `SC_`.
 *
 * @param {string} id - идентификатор адаптации
 * @returns {array} Массив объектов, содержащих данные об активностях:
 *   - `adaptation_id`: ID адаптации,
 *   - `learning_id`: ID курса,
 *   - `person_id`: ID пользователя,
 *   - `training_id`: код курса без префикса `SC_`.
 */
function getScActivitiesFromAdaptation(id) {
    var query = (
        "\nSELECT \n " +
        "   crs.id AS adaptation_id, \n" +
        "   t.query('object_id').value('.', 'bigint') AS learning_id, \n" +
        "   crs.person_id, \n" +
        "   replace(cs.code, 'SC_', '') AS training_id  \n" +
        "FROM career_reserves AS crs \n" +
        "LEFT JOIN career_reserve AS cr ON cr.id=crs.id \n" +
        "CROSS APPLY cr.data.nodes('career_reserve/tasks/task') AS t(t) \n" +
        "LEFT JOIN courses AS cs ON " +
                    "cs.id=t.query('object_id').value('.', 'bigint') \n" +
        "WHERE crs.id in (" + id + ") \n" +
        "AND crs.status in ('active', 'cancel') \n" +
        "AND t.query('type').value('.', 'varchar(max)') = 'learning' \n" +
        "AND cs.code LIKE 'SC[_]%'"
    )
    //addLog(query)

    var learnings = XQuery("sql: " + query)
    if (ArrayOptFirstElem(learnings) == undefined) {
        return []
    }

    return learnings
}

/**
 * Загрузка активностей SkillCup из адаптации
 * @param {string} id - идентификатор адаптации
 */
function loadFromAdaptation(id) {
    // если не идентификатор - выход
    if (OptInt(id) == undefined) {
        return
    }

    var activitiesFromAdaptation = getScActivitiesFromAdaptation(id)

    var activity, learning, person, training
    for (activity in activitiesFromAdaptation) {
        loadLearning(activity.person_id, activity.training_id, true)
    }
}

/**
 * Загрузка активностей SkillCup из адаптаций
 * @param {array} adaptations - идентификаторы адаптаций
 */
function loadFromAdaptations(adaptations) {
    var id, query
    for (id in adaptations) {
        addLog(id)
        loadFromAdaptation(id)
    }
}

/**
 * Главная функция
 */
function load(setting) {
    if (ArrayOptFirstElem(setting.adaptations) != undefined) {
        addLog("---")
        addLog("loadFromAdaptations")
        loadFromAdaptations(setting.adaptations)
    }

    if (setting.isLmsExt) {
        addLog("loadFromLmsExt")
        loadFromLmsExt(setting.lmsExt)
    }
}

/**
 * Получить массив из идентификаторов адаптаций
 * @param {string} json
 * @returns {array}
 */
function getAdaptations(json) {
    var adaptations = []
    try {
        adaptations = ParseJson(Trim(json))
    } catch(err) {}

    if (ObjectType(adaptations) != 'JsArray') {
        return []
    }

    return adaptations
}

/**
 * Преобразует входные параметры в структуру настроек для последующей обработки.
 * @param {Object} params - Входные параметры
 * @returns {Object}
 */
function getParams(params) {
    var settings = {}

    settings.isLmsExt = OptInt(params.isLmsExt, 0)
    settings.lmsExt = {
        days: OptInt(Trim(params.load_days), ""),
        training_id: Trim(params.load_training),
        code: Trim(params.load_code),
    }

    settings.adaptations = getAdaptations(params.json_adaptations)

    return settings
}


/**
 * Получить библиотеку для работы с SkillCup
 * @returns {XmElem}
 */
function getSkillCupLib() {
    var sc_path = 'x-local://wt/web/custom_projects/libs/skill_cup_load_lib.js'
    //DropFormsCache(sc_path)
    return OpenCodeLib(sc_path).clear()
}

/**
 * Получить библиотеку.
 * Создание завершенного курса из тренинга SkillCup
 * @returns {XmElem}
 */
function getLearningLib() {
    var learning_path = 'x-local://wt/web/custom_projects/libs/learning_lib.js'
    //DropFormsCache(learning_path)
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




// entry point
try {
    addLog("begin")

    var SQL = OpenCodeLib('x-local://wt/web/custom_projects/libs/sql_lib.js')
    var SC = getSkillCupLib()
    var LEARNING = getLearningLib()
    var ADAPTATION = getAdaptationLib()

    var settings = getParams(Param)
    load(settings)

    addLog("end")
} catch (err) {
    addLog("ERROR: " + err)
}
