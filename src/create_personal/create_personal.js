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

/**
 * Генерирует SQL-запрос для получения статистики по рабочим часам.
 * @param {object} param - Объект, содержащий параметры для формирования запроса.
 * @returns {string} Сформированный SQL-запрос.
 */
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

/**
 * Получает данные о людях по подразделениям.
 * @param {object} codes - Коды подразделений.
 * @returns {object} Объект с данными найденных людей.
 */
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

/**
 * Получает продолжительность работы указанного подразделения.
 * @param {string} code - Код подразделения.
 * @returns {number | null} Продолжительность для указанного подразделения.
 */
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

function getMetricsFromList(list) {
    var result = []

    var metric
    for (metric in list) {
        result.push(metric)
    }

    return result.join(",")
}

function getPersonMetric(person, branch, text) {
    var begin = "2025-11-01"
    var end = "2025-11-30"
    var query = (
        "select \n" +
        "    sa.ym \n" +
        "    , sa.user_tab_no \n" +
        "    , sum(coalesce(qty*full_price_rur, qty*(unit_price+discount))) " +
                                                                    "as fct \n" +
        "from core.t_asale as sa \n" +
        "join sb_motivation.dim_up_category_spec as mot \n" +
                        "on lower(mot.up_category) = lower(sa.up_category) \n" +
        "where 1=1 \n" +
        "    and mot.metric_name ilike '" + text + "' \n" +
        "    and sa.qty_up > 0 -- qty_up <> 0 -- с учетом возвратов \n" +
        "    and sa.user_tab_no = '" + person + "' \n" +
        "    and sa.branchcode = '" + branch + "' \n" +
        "    and sa.operation_date::date between \n" +
                        "date '" + begin + "' and date '" + end + "' \n" +
        "group by 1,2"
    )

    var metric = ArrayOptFirstElem(SQL_LIB.optXExec(query, 'corecpu'))
    if (metric == undefined) {
        return null
    }

    return OptInt(metric.fct, null)
}

function getSqlMetricBranch(branch, LIST) {
    var sMetrics = getMetricsFromList(LIST)

    var begin = "2025-11-01"
    var end = "2025-11-30 23:59:59"
    return (
        "\n" +
        "select distinct \n" +
        "    mt.description, \n" +
        "    dd.department_full_name, \n" +
        "    em.full_name, \n" +
        "    dm.metric_id AS id, \n" +
        "    dm.metric_name, \n" +
        "    m.metric_value AS value \n" +
        "from core.dwh_metric m \n" +
        "left join core.dm_office_hist as dd " +
                                    "on dd.department_id = m.entity_id_1 \n" +
        "left join core.dm_emp_hist as em " +
                                    "on em.emp_id  = m.entity_id_2 \n" +
        "left join core.dim_metric_type as mt " +
                                    "on mt.metric_type_id = m.metric_type_id \n" +
        "left join core.dim_metric as dm on dm.metric_id = m.metric_id \n" +
        "where m.metric_id in (" + sMetrics + ") \n" +
        "and period_code  = 'm' \n" +
        "and m.report_dt between date '" + begin + "' and date '" + end + "' \n" +
        "and m.metric_type_id in (1) \n" +
        "and dd.department_short_name = '" + branch + "'"
    )
}

function getBranchMetrics(branch, listOfMetrics) {
    if (METRICS_BRANCH.GetOptProperty(branch) != undefined) {
        return METRICS_BRANCH.GetOptProperty(branch)
    }

    METRICS_BRANCH[branch] = {}

    var query = getSqlMetricBranch(branch, listOfMetrics)
    var metrics = SQL_LIB.optXExec(query, 'corecpu')

    var metric
    for (metric in metrics) {
        METRICS_BRANCH[branch][String(metric.id)] = {
            branch: OptInt(metric.value, null),
        }
    }

    return METRICS_BRANCH.GetOptProperty(branch)
}

function getMetrics(person, branch) {
    var listOfMetrics = getListOfMetrics()
    var branchMetrics = getBranchMetrics(branch, listOfMetrics)

    var metric, find
    for (metric in branchMetrics) {
        find = listOfMetrics.GetOptProperty(metric, {}).GetOptProperty("find")
        branchMetrics[metric]["person"] = getPersonMetric(person, branch, find)
    }

    return branchMetrics
}

/**
 * Устанавливает данные о сотруднике в результирующий объект.
 * @param {object} result - Результирующий объект для добавления данных.
 * @param {object} person - Объект, содержащий данные о сотруднике.
 * @returns {object} Обновленный результирующий объект.
 */
function setPerson(result, person) {
    var codePerson = String(person.line_tab_num)
    var persDuration = String(person.duration_vacation)

    var codeSubdiv = String(person.office_amdocs_code)
    var subDuration = getSubDuration(codeSubdiv)
    var subMetrics = getMetrics(codePerson, codeSubdiv)

    var checkPersson = result.GetOptProperty(codePerson)
    if (checkPersson == undefined) {
        result[codePerson] = {length: 0}
    }

    result[codePerson].length = result[codePerson].length + 1,
    result[codePerson][codeSubdiv] = {
        person_duration: OptInt(persDuration, null),
        sub_duration: OptInt(subDuration, null),
        metrics: subMetrics,
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

function getListOfMetrics() {
    return {
        "303": {
            name: "Товарная выручка",
            find: "%товарная%"
        }
    }
}

// entry point
// назначение/доназначение модульной программы
try {
    addLog("begin")

    var SQL_LIB = OpenCodeLib("x-local://wt/web/custom_projects/libs/sql_lib.js")
    var SUBDIVISION = {}
    var METRICS_BRANCH = {}
    var METRICS_PERSON = {}

    main(Param)

    addLog("end")
}
catch(err) {
    addLog('ERROR: ' + err)
}
