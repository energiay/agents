/**
 * Логирование
 * @param {string} value - значение для логирования
 * @param {string} name - название файла лога
 */
function addLog(value, name) {
    var sLogName = name
    if (sLogName == undefined) {
        sLogName = "create_personal"
    }

    EnableLog(sLogName)
    LogEvent(sLogName, value)
}

function getSql(param) {
    var tabNum = ",a.line_tab_num"
    if (param.GetOptProperty("type") == "subdivision") {
        tabNum = ""
    }

    var codes = param.GetOptProperty("codes")
    var position = 'Специалист'

    return (
        "\n" +
        "-- разбивка сотрудников по кол-ву рабочих часов \n" +
        "-- по каждому офису за период \n" +
        "SELECT \n" +
        "    a.office_amdocs_code " +
        "    " + tabNum + " \n" +
        "    , a.employee_unit --роль 1с \n" +
        "    , a.exp_date \n" +
        "    , sum(duration_vacation) AS duration_vacation \n" +
        "FROM ( \n" +
        "   SELECT \n" +
        "       s.CODE_POINTS_SALE as office_amdocs_code \n" +
        "       , p.PERSON_NUMBER as line_tab_num \n" +
        "       , case when o.employee_unit LIKE '%пециалист%' \n" +
        "           OR o.employee_unit LIKE '%пециалист' \n" +
        "           THEN 'Специалист' \n" +
        "           ELSE 'Директор магазина' \n" +
        "       END AS employee_unit --роль 1с \n" +
        "       , date_trunc('month', e.oper_date) " +
                    "+ interval '1 month' - interval '1 day' as exp_date \n" +
        "       , COUNT(o.assigment_number)*8 AS duration_vacation \n" +
        "   FROM stage.bi_1c_employee_registration as e \n" +
        "   left join stage.bi_1c_shops s on e.SHOP_REF_ID = s.ref_id  \n" +
        "   left join stage.bi_1c_persons p on e.PERSON_REF_ID = p.REF_ID \n" +
        "   left join stage.bi_1c_employee_work_output o on " +
                            "p.PERSON_NUMBER = o.assigment_number " +
                            "AND e.oper_date = o.oper_date \n" +
        "   where 1=1  \n" +
        "   and e.oper_date >= '2025-11-01' AND e.oper_date <= '2025-11-30' \n" +
        "   AND o.usage_mnemonic IN ('Я','ЯОО','ЯВ') \n" +
        "   and s.CODE_POINTS_SALE in (" + codes + " ) \n" +
        "   GROUP BY \n" +
        "       s.CODE_POINTS_SALE \n" +
        "       ,p.PERSON_NUMBER \n" +
        "       ,case when o.employee_unit LIKE '%пециалист%' \n" +
        "           OR o.employee_unit LIKE '%пециалист' \n" +
        "           THEN 'Специалист' \n" +
        "           ELSE 'Директор магазина' \n" +
        "       END \n" +
        "       ,date_trunc('month', e.oper_date) " +
                "+ interval '1 month' " +
                "- interval '1 day' \n" +
        ") a \n" +
        "where a.employee_unit = '" + position + "' \n" +
        "GROUP BY \n" +
        "a.office_amdocs_code " +
        "" + tabNum + " \n" +
        ",a.employee_unit --роль 1с \n" +
        ",a.exp_date"
    )
}

function getPersons(codes) {
    var result = {}

    var query = getSql({codes: codes})
    var persons = SQL_LIB.optXExec(query, 'corecpu')

    var person, code
    for (person in persons) {
        result = setPerson(result, person)
    }

    return result
}

function getSubDuration(code) {
    var result = SUBDIVISION.GetOptProperty(code)
    if (result != undefined) {
        return result
    }

    var query = getSql({type: "subdivision", codes: SqlLiteral(code)})
    var subdivision = SQL_LIB.optXExec(query, 'corecpu')

    if (ArrayOptFirstElem(subdivision) == undefined) {
        SUBDIVISION[code] = null
        return null
    }

    SUBDIVISION[code] = ArrayOptFirstElem(subdivision).duration_vacation
    return ArrayOptFirstElem(subdivision).duration_vacation
}

function setPerson(result, person) {
    var codePerson = String(person.line_tab_num)
    var persDuration = String(person.duration_vacation)

    var codeSubdiv = String(person.office_amdocs_code)
    var subDuration = getSubDuration(codeSubdiv)

    var checkPersson = result.GetOptProperty(codePerson)
    if (checkPersson == undefined) {
        result[codePerson] = {length: 0}
    }

    result[codePerson].length = result[codePerson].length + 1,
    result[codePerson][codeSubdiv] = {
        person_duration: OptInt(persDuration, null),
        sub_duration: OptInt(subDuration, null),
    }

    return result
}

/**
 * Главная функция
 * @param {object} param - Параметры выполнения функции.
 * @property {string} param.subs - Список подразделений.
 */
function main(param) {
    // получаем отработанное время сотрудников в разрезе офисов
    // и время работы офиса
    var persons = getPersons(param.subs)
    addLog(tools.object_to_text(persons, 'json'))
}

// entry point
// назначение/доназначение модульной программы
try {
    addLog("begin")

    var SQL_LIB = OpenCodeLib("x-local://wt/web/custom_projects/libs/sql_lib.js")
    var SUBDIVISION = {}
    main(Param)

    addLog("end")
}
catch(err) {
    addLog('ERROR: ' + err)
}
