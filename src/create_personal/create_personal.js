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
function getPersonsSql(param) {
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
        "   --and p.person_number in ('273332') \n" +
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

function getBranchCode(list) {
    var code
    for (code in list) {
        if (code == 'length') {
            continue
        }

        return code
    }

    return null
}

/**
 * Вычисляет метрики для подразделения.
 * @param {string} code - Табельный номер сотрудника.
 * @param {object} branches - Объект с подразделениями.
 * @returns {object|null} Вычисленные метрики или null, если данные отсутствуют.
 */
function calcBranch(code, branches) {
    var metrics = {}

    var data = branches.GetOptProperty(code)
    if (data.person_duration == null || data.branch_duration == null) {
        return null
    }

    var time = Real(data.person_duration) / data.branch_duration
    var weightedAverage = (Real(data.person_duration) * time * 1) / 100

    var metricId, metric, personPlan
    for (metricId in data.metrics) {
        metric = data.metrics[metricId]
        if (metric.branch == null || weightedAverage == null) {
            metrics[metricId] = null
            continue
        }

        personPlan = metric.branch * weightedAverage
        if (personPlan == 0 || metric.person == null) {
            metrics[metricId] = null
            continue
        }

        personResult = Real(metric.person) / personPlan
        metrics[metricId] = (personResult * 100)
    }

    return metrics
}

function calcOneMetrics(data) {
    // извлекаем данные
    var personCode = data.personCode
    var branchCode = getBranchCode(data.branches[personCode])
    var branches = data.metrics.GetOptProperty(personCode, {})
    var value = branches.GetOptProperty(branchCode)

    return OptInt(value, null)
}

function calcTwoMetrics(data) {
    var personCode = data.personCode

    //var value = branches.GetOptProperty(branchCode)

    return OptInt(value, null)
}

function calcMetrics(data) {
    if (data.branches.length == 1) {
        return calcOneMetrics(data)
    }

    if (data.branches.length == 2) {
        return calcTwoMetrics(data)
    }
}

/**
 * Устанавливает метрики для сотрудника, вычисляя данные по подразделениям.
 * @param {object} metrics - Объект для хранения вычисленных метрик.
 * @param {object} person - Данные по сотруднику.
 * @param {object} calculate - Объект, содержащий данные для вычислений.
 * @returns {object}
 */
function setMetricsPerson(metrics, person, calculate) {
    var personCode = String(person.line_tab_num)
    if (metrics.GetOptProperty(code) == undefined) {
        metrics[personCode] = {}
    }

    var branches = calculate.GetOptProperty(personCode)
    var branchCode
    for (branchCode in branches) {
        if (branchCode == 'length') {
            continue
        }

        metrics[personCode][branchCode] = calcBranch(branchCode, branches)
    }

    metrics[personCode]["result"] = calcMetrics({
        personCode: personCode,
        branches: branches,
        metrics: metrics,
    })

    return metrics
}

/**
 * Вычисляет метрики для заданных кодов.
 * @param {string} codes - коды подразделений, для подстановки в sql
 * @returns {Array<object>}
 */
function getMetricsOfBranches(codes) {
    var calculate = {}
    var metrics = {}

    var query = getPersonsSql({codes: codes})
    var persons = SQL_LIB.optXExec(query, 'corecpu')

    var person, code
    for (person in persons) {
        calculate = setDataPerson(calculate, person)
        metrics = setMetricsPerson(metrics, person, calculate)
    }

    return [calculate, metrics]
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

    var query = getPersonsSql({type: "subdivision", codes: SqlLiteral(code)})
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

/**
 * Получает факт сотрудника по филиалу
 * @param {string} person - Табельный номер сотрудника.
 * @param {string} branch - Код филиала.
 * @param {string} find - Строка для поиска метрики
 * @returns {number|null} Значение метрики или null, если не найдено.
 */
function getPersonMetric(person, branch, find) {
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
        "    and mot.metric_name ilike '" + find + "' \n" +
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

/**
 * Формирует SQL-запрос для получения метрик по филиалу.
 * @param {string} branch - Код филиала.
 * @param {object} LIST - Список метрик.
 * @returns {string} SQL-запрос в виде строки.
 */
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

/**
 * Создает глубокую копию объекта.
 * Работает только для примитивов и объектов с примитивами.
 *
 * @param {object} obj - Исходный объект для копирования.
 * @returns {object} Новая глубокая копия объекта.
 */
function createObject(obj) {
    var result = {}

    var field
    for (field in obj) {
        if (DataType(obj[field]) == 'object') {
            result[field] = createObject(obj[field])
            continue
        }

        result[field] = obj[field]
    }

    return result
}

/**
 * Получает метрики для подразделения из кеша или базы данных.
 * @param {string} branch - Идентификатор ветки.
 * @param {object} listOfMetrics - Список идентификаторов метрик.
 * @returns {object} Объект с метриками ветки.
 */
function getBranchMetrics(branch, listOfMetrics) {
    if (METRICS_BRANCH.GetOptProperty(branch) != undefined) {
        return createObject(METRICS_BRANCH.GetOptProperty(branch))
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

    return createObject(METRICS_BRANCH.GetOptProperty(branch))
}

/**
 * Получает метрики для указанного сотрудника и филиала.
 * @param {string} person - Идентификатор сотрудника.
 * @param {string} branch - Идентификатор филиала.
 * @returns {object} Объект с метриками филиала и сотрудника.
 */
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
function setDataPerson(result, person) {
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
        branch_duration: OptInt(subDuration, null),
        metrics: subMetrics,
    }

    return result
}

/**
 * Главная функция
 * @param {object} param - Параметры выполнения функции.
 * @property {string} param.subs - Список подразделений, для подстановки в sql
 */
function main(param) {
    // получаем данные по сотрудникам
    var metricsOfBranches = getMetricsOfBranches(param.subs)
    addLog(tools.object_to_text(metricsOfBranches, 'json'))
}

/**
 * Возвращает список метрик с их описаниями.
 * @returns {object}
 */
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

    main(Param)

    addLog("end")
}
catch(err) {
    addLog('ERROR: ' + err)
}
