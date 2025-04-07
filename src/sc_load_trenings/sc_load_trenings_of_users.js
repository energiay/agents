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
        "SELECT TOP 1 \n" +
        "   --users.*, \n" +
        "   stat.* \n" +
        "FROM SC_Stats AS stat \n" +
        "LEFT JOIN sc_users AS users ON users.id = stat.user_id \n" +
        "WHERE stat.id = 'bb2c797d-05ef-46cc-9963-18817f1d8422' \n" +
        "ORDER BY stat.created_at"
    )

    var sql_lib = OpenCodeLib('x-local://wt/web/custom_projects/libs/sql_lib.js')
    var data = sql_lib.optXExec(query, 'ars')

    return data
}

/**
 * Создать/заполнить тренинг
 * @param {object} training
 */
function fillTraining(training) {
    addLog(tools.object_to_text(training, 'json'))
    var card = OpenNewDoc("x-local://wtv/wtv_learning.xmd")
    card.BindToDb()

    card.TopElem.base_url = String(training.id)
    card.TopElem.person_id = 7147583355778132228

    card.Save()
}

/**
 * Главная функция
 */
function load() {
    var trainings = getTrainings()

    var training
    for (training in trainings) {
        fillTraining(training)
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
