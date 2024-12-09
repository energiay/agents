/**
 * Логирование
 * @param {string} value - значение для логирования
 * @param {string} name - название файла лога
 */
function addLog(value, name) {
    var sLogName = name;
    if (sLogName == undefined) {
        sLogName = 'appoint_compound_program';
    }

    EnableLog(sLogName);
    LogEvent(sLogName, value);
}

/**
 * Получить сотрудников из группы
 * @param {string} groupId
 * @return {array}
 */
function getPersonsFromGroup(groupId) {
    var ssql = (
        "SELECT * \n" +
        "FROM group_collaborators \n" +
        "WHERE group_id = " + SqlLiteral(groupId)
    )

    return XQuery("sql: " + ssql)
}

/**
 * Функция назначения модульной программы
 * @param {object} settings
 * @return {array}
 */
function makeCompoundProgram(settings) {
    var persons = getPersonsFromGroup(settings.group)

    var person, plan
    for (person in persons) {
        addLog(person.collaborator_fullname)
        plan = LIB.generatePlan(person.collaborator_id, settings.compound_program)
        //addLog('plan: ' + tools.object_to_text(plan, 'json'))
    }
}



// entry point
// назначение/доназначение модульной программы
try {
    addLog("begin")

    var path = 'x-local://wt/web/custom_projects/libs/compound_program_lib.js'
    DropFormsCache(path)
    var LIB = OpenCodeLib(path).clear()

    var param = {
        group: Param.group,
        compound_program: Param.compound_program,
    }
    makeCompoundProgram(param)

    addLog("end")
}
catch(err) {
    addLog('ERROR: ' + err)
}

