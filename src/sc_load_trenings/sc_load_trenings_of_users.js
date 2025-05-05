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
    )

    var data = SQL_LIB.optXExec(query, 'ars')

    addLog(query)
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
 * Загрузка SkillCup курсов на основе данных из бд WTDB_lmsext001
 * @param {object} setting
 */
function loadLmsExt(setting) {
    if (isEmptySetting(setting)) {
        addLog(
            "Агент остановлен т.к. значения всех параметров пусты" +
            "(load_days, load_training, load_code)"
        )
        return
    }

    // получение SkillCup тренингов
    var trainings = getWtTrainings(setting)

    var training, response, code, trainingId
    for (training in trainings) {
        code = training.user_code
        trainingId = training.id
        response = SC.loadTrainingForUser(code, trainingId)

        if (response.success) {
            LEARNING.learningOfSkillCup(code, response.data)
        }
    }
}

/**
 *
 */
function getActivitiesFromAdaptation(id) {
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
        "AND cs.code LIKE 'SC_%'"
    )

    var learnings = XQuery("sql: " + query)
    if (ArrayOptFirstElem(learnings) == undefined) {
        return []
    }

    return learnings
}

/**
 *
 */
function loadAdaptation(id) {
    var activitiesFromAdaptation = getActivitiesFromAdaptation(id)

    var activity
    for (activity in activitiesFromAdaptation) {
        addLog(activity.learning_id)
    }
}

/**
 *
 */
function loadAdaptations(adaptations) {
    //addLog("adaptations" + tools.object_to_text(setting.adaptations, 'json'))
    var id, query
    for (id in adaptations) {
        loadAdaptation(id)
    }
}

/**
 * Главная функция
 */
function load(setting) {
    if (ArrayOptFirstElem(setting.adaptations) != undefined) {
        loadAdaptations(setting.adaptations)
    }

    if (setting.isLmsExt) {
        addLog("lmsext")
        //loadLmsExt(setting.lmsExt)
    }
}

/**
 * Получить массив из идентификаторов адаптпций
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




// entry point
try {
    addLog("begin")

    var SQL_LIB = OpenCodeLib('x-local://wt/web/custom_projects/libs/sql_lib.js')

    var sc_path = 'x-local://wt/web/custom_projects/libs/skill_cup_load_lib.js'
    var SC = OpenCodeLib(sc_path).clear()

    var learning_path = 'x-local://wt/web/custom_projects/libs/learning_lib.js'
    var LEARNING = OpenCodeLib(learning_path).clear()

    var settings = getParams(Param)
    load(settings)

    addLog("end")
} catch (err) {
    addLog("ERROR: " + err)
}
