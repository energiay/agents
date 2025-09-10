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
 * Получает список активностей Skill Cup
 * @returns {Array<Object>} Список активностей адаптаций.
 */
function getScActivitiesFromAdaptations() {
    var query = (
        "\n" +
        "SELECT \n" +
        "    ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS nums, \n" +
        "    crs.id AS adaptation_id, \n" +
        "    crs.person_id, \n" +
        "    person.code AS person_code, \n" +
        "    crs.person_fullname, \n" +
        "    t.query('name').value('.', 'varchar(max)') AS task_name, \n" +
        "    t.query('id').value('.', 'varchar(max)') AS task_id, \n" +
        "    cs.code \n" +
        "FROM career_reserves AS crs \n" +
        "LEFT JOIN career_reserve AS cr ON cr.id=crs.id \n" +
        "LEFT JOIN collaborators AS person ON person.id=crs.person_id \n" +
        "CROSS APPLY cr.data.nodes('career_reserve/tasks/task') AS t(t) \n" +
        "LEFT JOIN courses AS cs ON " +
                            "cs.id=t.query('object_id').value('.', 'bigint') \n" +
        "WHERE crs.status in ('active') \n" +
        "AND t.query('type').value('.', 'varchar(max)') = 'learning' \n" +
        "AND t.query('status').value('.', 'varchar(max)') <> 'passed' \n" +
        "AND cs.code LIKE 'SC[_]%' \n" +
        "AND cs.code IS NOT NULL \n" +
        "ORDER BY nums DESC"
    )
    addLog(query)

    var activities = XQuery("sql: " + query)
    if (ArrayOptFirstElem(activities) == undefined) {
        return []
    }

    return activities
}

/**
 * Загрузка данных по одному тренингу конкретного пользователя
 * @param {string} username - Идентификатор сотрудника
 * @param {string} code - Код курса (пример, SC_monobrand_<uuid>)
function loadLearning(person, code) {
    // загрузить данные из Skill Cup
    var response = SC.loadTrainingForUser(person, code)
    if (!response.success) {
        return response
    }

    // Создать/обновить карточку курса в WT
    var settings = {force: true, channel: response.data.channel}
    var training = response.data.training
    var learning = LEARNING.learningOfSkillCup(person, training, settings)
    if (!learning.success) {
        return learning
    }

    // Проставить карточку курса в активность адаптации
    ADAPTATION.execCard(learning.card.TopElem)

    return {success: true}
}
 */

/**
 * Загрузить активности skill cup
 */
function loadScToAdaptations() {
    var activities = getScActivitiesFromAdaptations()
    if (ArrayOptFirstElem(activities) == undefined) {
        return
    }

    var libs = {sc: SC, learning: LEARNING}
    var length = String(ArrayOptFirstElem(activities).nums)
    var i = 0
    var activity, res
    for (activity in activities) {
        i++

        addLog("")
        addLog(i + " из " + length)
        addLog("Адаптация: " + activity.adaptation_id)
        addLog(activity.task_id + " " + activity.task_name)
        addLog(activity.person_fullname + " " + activity.person_id)
        addLog("Код курса: " + activity.code)
        res = ADAPTATION.loadLearning(activity.person_id, activity.code, libs)
        addLog(tools.object_to_text(res, 'json'))
    }
}




// entry point
try {
    var SC = getSkillCupLib()
    var LEARNING = getLearningLib()
    var ADAPTATION = getAdaptationLib()

    loadScToAdaptations()
} catch (err) {
    addLog("ERROR: " + err)
}
