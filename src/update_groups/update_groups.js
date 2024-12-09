/**
 * Логирование
 * @param {string} value - значение для логирования
 * @param {string} name - название файла лога
 */
function addLog(value, name) {
    var sLogName = name
    if (sLogName == undefined) {
        sLogName = 'update_groups'
    }

    EnableLog(sLogName)
    LogEvent(sLogName, value)
}


/**
 * Заполнение группы сотрудниками
 * @param {integer} group
 * @param {string} ssql
 */
function fillGroup(group, ssql) {
    var persons = XQuery('sql: ' + ssql)
    if (ArrayOptFirstElem(persons) == undefined) {
        return
    }

    var card = OpenDoc(UrlFromDocID(group))
    card.TopElem.collaborators.Clear()

    var child
    for (person in persons) {
        child = card.TopElem.collaborators.ObtainChildByKey(person.id)
    }

    card.Save()
}


/**
 * Получить sql-запрос по пораметрам
 * @param {object} settings
 * @return {string}
 */
function getSql(settings) {
    if (settings.sql != "") {
        return settings.sql
    }

    if (settings.position_common_id != "") {
        return (
            "SELECT cs.id \n" +
            "FROM collaborators AS cs \n" +
            "LEFT JOIN positions AS ps ON ps.id=cs.position_id \n" +
            "WHERE ps.position_common_id=" + settings.position_common_id + " \n" +
            "      AND cs.is_dismiss=0 \n"
        )
    }

    if (settings.boss_type_of_subdivision != "") {
        return (
            "SELECT DISTINCT person_id AS id \n" +
            "FROM func_managers AS fs \n" +
            "LEFT JOIN collaborators AS cs ON cs.id=fs.person_id \n" +
            "WHERE fs.catalog = 'subdivision' \n" +
            "AND fs.boss_type_id = " + settings.boss_type_of_subdivision + " \n" +
            "AND cs.is_dismiss = 0"
        )
    }

    return ""
}


/**
 * Запуск обработки потока
 * @param {object} settings
 */
function run(settings) {
    var groupId = OptInt(settings.group_id)
    if (groupId == undefined) {
        return
    }

    var ssql = getSql(settings)
    if (ssql == "") {
        return
    }

    fillGroup(groupId, ssql)
}



// enrty point
try {
    var threads = ParseJson(Param.threads)

    var thread
    for(thread in threads) {
        if (thread.enabled != "true") {
            continue
        }

        run(thread)
    }
}
catch (err) {
    //alert("7366207744145445737 ERROR :" + err)
    addLog("ERROR 7366207744145445737: " + err)
}
