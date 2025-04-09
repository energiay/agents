/**
 * Логирование
 * @param {string} value - значение для логирования
 * @param {string} name - название файла лога
 */
function addLog(value, name) {
    var sLogName = name
    if (sLogName == undefined) {
        sLogName = "sc_load_trenings_of_users"
    }

    EnableLog(sLogName)
    LogEvent(sLogName, value)
}

/**
 * Получение SC тренингов
 * @return {array}
 */
function getTrainings() {
    var query = (
        "SELECT \n" +
        "   users.username AS user_code,  \n" +
        "   stat.*  \n" +
        "FROM SC_Stats AS stat  \n" +
        "LEFT JOIN sc_users AS users ON users.id = stat.user_id  \n" +
        //"WHERE users.username = '413864'"
        "WHERE users.username = '494467'"
        //"  AND stat.id = 'bb2c797d-05ef-46cc-9963-18817f1d8422'"
    )

    var sql_lib = OpenCodeLib('x-local://wt/web/custom_projects/libs/sql_lib.js')
    var data = sql_lib.optXExec(query, 'ars')

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
 */
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

    addLog("")
    addLog(query)
    //addLog(tools.object_to_text(learning, 'json'))

    return learning
}

/**
 * Получить TopElem карточки пользователя
 * @param {string} code - таб№ сотрудника
 * @return {XmElem}
 */
function getUser(code) {
    // TODO: тут буде оптимизация, когда агент начнет долго работать
    // добавлю кеширование для карточек пользователей

    // найти сотрудника в БД
    var query = "SELECT id FROM collaborators WHERE code = " + SqlLiteral(code)
    var users = XQuery("sql: " + query)

    var user = ArrayOptFirstElem(users)
    if (user == undefined) {
        return null
    }

    if (ArrayCount(users) > 1) {
        addLog("Error: по таб№ найдено больше одного сотрудника: " + code)
        return null
    }

    //addLog("")
    //addLog(query)
    //addLog(tools.object_to_text(user, 'json'))
    return {
        id: Int(user.id),
        card: OpenDoc(UrlFromDocID(Int(user.id))).TopElem,
    }
}

/**
 * Получить TopElem карточки курса из тренинга SC
 * @param {object} learning
 * @return {object || null}
 */
function getCourse(learning) {
    // TODO: тут будет оптимизация, когда агент начнет долго работать
    // добавлю кеширование для карточек курса

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

    //addLog("")
    //addLog(query)
    //addLog(tools.object_to_text(course, 'json'))
    return {
        id: Int(course.id),
        card: OpenDoc(UrlFromDocID(Int(course.id))).TopElem,
    }
}

/**
 * Проставить поля в карточку завершенного курса
 * @param {XmElem} cardLearning
 * @param {object} user
 * @param {object} course
 * @param {object} training
 * @return {XmElem}
 */
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

/**
 * Загрузить завершенный курс из тренинга (Skill Cap)
 * @param {object} training
 * @return {XmElem || null}
 */
function loadLearning(training) {
    var user = getUser(training.user_code)
    if (user == null) {
        return null
    }

    var course = getCourse(training)
    if (course == null) {
        return null
    }

    var learning = getLearning(training, user, course)
    var cardLearning
    if (learning == null) {
        cardLearning = OpenNewDoc("x-local://wtv/wtv_learning.xmd")
        cardLearning.BindToDb()
        addLog( "new " + cardLearning.DocID)
    } else {
        cardLearning = OpenDoc(UrlFromDocID(Int(learning.id)))
        addLog( "exist " + cardLearning.DocID)
    }

    cardLearning = fillTrainingFields(cardLearning, user, course, training)
    cardLearning.Save()

    return cardLearning.TopElem
}

/**
 * Главная функция
 */
function load() {
    var trainings = getTrainings()

    var training
    for (training in trainings) {
        loadLearning(training)
    }
}




// entry point
try {
    addLog("begin")
    load()
    addLog("end")
} catch (err) {
    addLog("ERROR: " + err)
}
