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
        //"WHERE stat.start_at >= CAST(DATEADD(DAY, -34, GETDATE()) AS DATE) \n" +
        //"AND stat.user_id = 'dbd305a1-59d1-40d4-bd56-eccaa0e0e563'"
    )

    var data = SQL_LIB.optXExec(query, 'ars')

    addLog(query)
    addLog("")
    return data
}

/**
 * Получить карточку завершенного курса
 * @param {object} training - тренинг из SC
 * @param {object} user
 * @param {object} course
 * @return {object || null}
function getLearning(training, user, course) {
    var created = training.created_at
    var query = (
        "SELECT ls.id \n" +
        "FROM learnings AS ls \n" +
        "LEFT JOIN learning AS l ON l.id=ls.id \n" +
        "WHERE ls.person_id = " + user.id + " \n" +
        "AND ls.course_id = " + course.id + " \n" +
        "AND ls.creation_date = CONVERT(datetime, '" + created + "', 104)"
    )

    var learnings = XQuery("sql: " + query)

    var learning = ArrayOptFirstElem(learnings)
    if (learning == undefined) {
        return null
    }

    if (ArrayCount(learnings) > 1) {
        addLog("Error: найдено больше одного завершенного курса:\n" + query)
        return null
    }

    //addLog("")
    //addLog(query)

    return learning
}
 */

/**
 * Получить сотрудника из БД
 * @param {string} code - таб№ сотрудника
 * @return {XmElem || null}
function getUserFormBd(code) {
    var query = (
        "SELECT id \n" +
        "FROM collaborators \n" +
        "WHERE is_dismiss = 0 AND code = " + SqlLiteral(code)
    )

    var users = XQuery("sql: " + query)

    var user = ArrayOptFirstElem(users)
    if (user == undefined) {
        return null
    }

    if (ArrayCount(users) > 1) {
        addLog("Error: по таб№ найдено больше одного сотрудника: " + code)
        return null
    }

    return user
}
 */

/**
 * Получить TopElem карточки пользователя
 * @param {string} code - таб№ сотрудника
 * @return {object}
function getUser(code) {
    // вернуть сотрудника из кэша, если он там есть
    if (cacheUsers.GetOptProperty(code) != undefined) {
        return cacheUsers.GetOptProperty(code)
    }

    // формируем ответ функции - ошибочный
    var cache = {success: false}
    var user = getUserFormBd(code)
    if (user == null) {
        cacheUsers[code] = cache
        return cache
    }

    // формируем ответ функции - успешный
    cache = {
        success: true,
        id: Int(user.id),
        card: OpenDoc(UrlFromDocID(Int(user.id))).TopElem,
    }

    // Сохранить сотрудника в кэш по таб№
    cacheUsers[code] = cache

    return cache
}
 */

/**
 * Получить курс из БД
 * @param {string} code - таб№ сотрудника
 * @return {XmElem || null}
function getCourseFormBd(learning) {
    // найти курс в БД
    var code = "SC_" + learning.id
    var query = "SELECT id FROM courses WHERE code = " + SqlLiteral(code)
    var courses = XQuery("sql: " + query)

    var course = ArrayOptFirstElem(courses)
    if (course == undefined) {
        return null
    }

    if (ArrayCount(courses) > 1) {
        addLog("Error: найдено больше одного курса: " + query)
        return null
    }

    return course
}
 */

/**
 * Получить TopElem карточки курса из тренинга SC
 * @param {object} learning
 * @return {object || null}
function getCourse(learning) {
    // вернуть курс из кэша, если он там есть
    if (cacheCourses.GetOptProperty(learning.id) != undefined) {
        return cacheCourses.GetOptProperty(learning.id)
    }

    // формируем ответ функции - ошибочный
    var cache = {success: false}

    var course = getCourseFormBd(learning)
    if (course == null) {
        cacheCourses[learning.id] = cache
        return cache
    }

    // формируем ответ функции - успешный
    cache = {
        success: true,
        id: Int(course.id),
        card: OpenDoc(UrlFromDocID(Int(course.id))).TopElem,
    }

    // Сохранить курс в кэш по идентификатору
    cacheCourses[learning.id] = cache

    return cache
}
 */


/**
 * Проставить поля в карточку завершенного курса
 * @param {XmElem} cardLearning
 * @param {object} user
 * @param {object} course
 * @param {object} training
 * @return {XmElem}
function fillTrainingFields(cardLearning, user, course, training) {
    cardLearning.TopElem.person_id = Int(user.id)
    tools.common_filling('collaborator', cardLearning.TopElem, user.id, user.card)

    cardLearning.TopElem.course_id = Int(course.id)
    tools.common_filling('course', cardLearning.TopElem, course.id, course.card)

    cardLearning.TopElem.doc_info.creation.date =   Date(training.created_at)
    cardLearning.TopElem.last_usage_date =          Date(training.completed_at)
    cardLearning.TopElem.max_end_date =             Date(training.completed_at)
    cardLearning.TopElem.start_usage_date =         Date(training.start_at)
    cardLearning.TopElem.start_learning_date =      Date(training.start_at)

    cardLearning.TopElem.score = OptInt(training.progress_percentage, "")

    cardLearning.TopElem.code = "SC_" + String(training.id)
    cardLearning.TopElem.state_id = (training.status == 'ready' ? 4 : 3)
    cardLearning.TopElem.is_self_enrolled = 1

    return cardLearning
}
 */

/**
 * Загрузить завершенный курс из тренинга (Skill Cap)
 * @param {object} training
 * @return {XmElem || null}
function loadLearning(training) {
    var user = getUser(training.user_code)
    if (!user.success) {
        return null
    }

    var course = getCourse(training)
    if (!course.success) {
        return null
    }

    var learning = getLearning(training, user, course)
    var cardLearning
    if (learning == null) {
        cardLearning = OpenNewDoc("x-local://wtv/wtv_learning.xmd")
        cardLearning.BindToDb()
        //addLog( "new " + cardLearning.DocID)
    } else {
        cardLearning = OpenDoc(UrlFromDocID(Int(learning.id)))
        //addLog( "exist " + cardLearning.DocID)
    }

    cardLearning = fillTrainingFields(cardLearning, user, course, training)
    cardLearning.Save()

    return cardLearning.TopElem
}
 */

/**
function getCards(training) {
    var id = SqlLiteral(training.id)
    var code SqlLiteral(training.user_code)

    var query = (
        "\n\n" +
        "SELECT * \n" +
        "FROM SC_tests AS t \n" +
        "LEFT JOIN sc_users AS u ON u.id = t.user_id \n" +
        "WHERE u.username = " + code + "\n" +
        "AND t.id = " + id + "\n"
    )

    var data = SQL_LIB.optXExec(query, 'ars')

    addLog(query)
    addLog("")
    return data
}
 */

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
 * Главная функция
 */
function load(setting) {
    if (isEmptySetting(setting)) {
        return
    }

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




// entry point
try {
    addLog("begin")

    var SQL_LIB = OpenCodeLib('x-local://wt/web/custom_projects/libs/sql_lib.js')

    var sc_path = 'x-local://wt/web/custom_projects/libs/skill_cup_load_lib.js'
    var SC = OpenCodeLib(sc_path).clear()

    var learning_path = 'x-local://wt/web/custom_projects/libs/learning_lib.js'
    var LEARNING = OpenCodeLib(learning_path).clear()

    var setting = {
        days: OptInt(Trim(Param.load_days), ""),
        training_id: Trim(Param.load_training),
        code: Trim(Param.load_code),
    }

    load(setting)

    addLog("end")
} catch (err) {
    addLog("ERROR: " + err)
}
