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

/**
 * Извлекает первый ключ из объекта, игнорируя свойство 'length'.
 * @param {object} list - Объект, из которого извлекается ключ.
 * @returns {string|null} Первый найденный ключ или null, если ключи отсутствуют.
 */
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
            metrics[metricId] = 0
            continue
        }

        personResult = Real(metric.person) / personPlan
        metrics[metricId] = (personResult * 100)
    }

    return metrics
}

/**
 * Получает значение метрики по подразделению.
 * Если подразделение не передано, берем первое попавшееся подразделение.
 *
 * @param {object} data
 * @param {string} code - Код подразделения.
 * @returns {number|null}
 */
function getValueFromBranch(data, code) {
    // получаем код подразделения
    var branchCode = code
    if (branchCode == undefined) {
        branchCode = getBranchCode(data.branches)
    }

    // извлекаем данные
    var branches = data.metrics.GetOptProperty(data.personCode, {})
    var metrics = branches.GetOptProperty(branchCode)

    var result = {}

    // проставление данных
    var metricId
    for (metricId in metrics) {
        result[metricId] = OptInt(metrics[metricId], null)
    }

    return result
}

/**
 * Проверяет, превышает ли продолжительность в часах заданное количество дней.
 * @param {string} code - Код подразделения.
 * @param {object} branches - Список подразделений.
 * @param {number} days - Количество дней для сравнения.
 * @returns {boolean} True, если продолжительность больше или равна; иначе false.
 */
function isDurationDays(code, branches, days) {
    var time = days * 8

    var branch = branches.GetOptProperty(code, {})
    var duration = branch.GetOptProperty("person_duration", null)
    var iDuration = OptInt(duration, null)
    if (iDuration == null) {
        return false
    }

    if (iDuration >= time) {
        return true
    }

    return false
}

/**
 * Разделяет подразделения на две группы по продолжительности.
 * @param {object} data - Объект, содержащий информацию о подразделениях.
 * @param {number} days - Количество дней.
 * @returns {object}
 */
function getMinMaxValues(data, days) {
    var maxBranches = []
    var minBranches = []

    var branchCode
    for (branchCode in data.branches) {
        if (branchCode == "length") {
            continue
        }

        if (isDurationDays(branchCode, data.branches, days)) {
            maxBranches.push(branchCode)
            continue
        }

        minBranches.push(branchCode)
    }

    return {
        min: minBranches,
        max: maxBranches,
    }
}

/**
 * Суммирует числовые значения из объекта.
 * @param {object} sumMetrics - Объект, где будут накапливаться суммы.
 * @param {object} metrics - Объект, содержащий значения для суммирования.
 * @returns {object}
 */
function getSumFromObjects(sumMetrics, metrics) {
    var metricId, val
    for (metricId in metrics) {
        if (sumMetrics.GetOptProperty(metricId) === undefined) {
            sumMetrics[metricId] = 0
        }

        val = OptInt(metrics[metricId], null)
        if (val === null || sumMetrics[metricId] === null) {
            sumMetrics[metricId] = null
            continue
        }

        sumMetrics[metricId] += val
    }

    return sumMetrics
}

/**
 * Вычисляет среднее значение метрик из объекта.
 * @param {object} sum - Объект, содержащий суммы метрик.
 * @param {number} count - Количество элементов для усреднения.
 * @returns {object|null} Объект со средними значениями метрик, или null.
 */
function getAverageFromObject(sum, count) {
    if (count == 0) {
        return null
    }

    var result = {}

    var metricId
    for (metricId in sum) {
        if (sum.GetOptProperty(metricId) === null) {
            result[metricId] = null
            continue
        }

        result[metricId] = OptInt(sum[metricId] / count, null)
    }

    return result
}

/**
 * Вычисляет среднее значение метрик для набора кодов.
 * @param {object} data - Объект с данными пользователя и его метриками.
 * @param {array} codes - Список из кодов подразделений.
 * @returns {object|null} Объект со средними значениями метрик или null.
 */
function getAverageValue(data, codes) {
    var personCode = data.GetOptProperty("personCode")
    var metrics = data.metrics.GetOptProperty(personCode, {})

    var count = 0
    var sumMetrics = {}

    var code, branchMetrics
    for (code in codes) {
        branchMetrics = metrics.GetOptProperty(code, null)
        if (metrics == null) {
            return null
        }

        // суммируем
        sumMetrics = getSumFromObjects(sumMetrics, branchMetrics)
        count++ // подсчитываем кол-во
    }

    // вычисляем среднее значение
    return getAverageFromObject(sumMetrics, count)
}

/**
 * Преобразует объект в массив объектов с кодом и продолжительностью.
 * @param {object} list - Объект для преобразования.
 * @returns {Array}
 */
function objectToArray(list) {
    var result = []

    var code
    for (code in list) {
        if (code == 'length') {
            continue
        }

        result.push({code: code, person_duration: list[code].person_duration})
    }

    return result
}

/**
 * Определяет подразделение для подсчета (из двух).
 * @param {object} list - Объект, содержащий как минимум две ветки.
 * @returns {string|string[]} Код ветки или массив кодов при равенстве.
 */
function getMaxBranch(list) {
    var arr = objectToArray(list) // тут цикл
    if (arr[0].person_duration == arr[1].person_duration) {
        return [arr[0].code, arr[1].code]
    }

    if (arr[0].person_duration > arr[1].person_duration) {
        return arr[0].code
    }

    return arr[1].code
}

/**
 * Проверить, является ли переданная переменная `data` объектом
 * @param {object} data
 * @return {bool}
 */
function isObject(data) {
    if (DataType(data) != "object") {
        return false
    }

    if (ObjectType(data) != "JsObject") {
        return false
    }

    return true
}

/**
 * Проверить, является ли переданная переменная `data` массивом
 * @param {object} data
 * @return {bool}
 */
function isArray(data) {
    if (DataType(data) != "object") {
        return false
    }

    if (ObjectType(data) != "JsArray") {
        return false
    }

    return true
}

/**
 * Выполняет расчет метрик на основе входных данных (по двум подразделениям).
 * @param {object} data - Входные данные для расчета.
 * @returns {object|null} Результат расчета или null.
 */
function calcTwoBranches(data) {
    // TODO: объединить циклы в getMinMaxValues и в getMaxBranch

    var DAYS = 7 // кол-во смен

    // Делим подразделения на: больше DAYS смен и меньше DAYS смен
    var minMaxValues = getMinMaxValues(data, DAYS)

    // среднее значение между офисами
    if (ArrayCount(minMaxValues.max) == 2) {
        return getAverageValue(data, minMaxValues.max)
    }

    // получаем код подразделения
    var branch = getMaxBranch(data.branches)

    // если на одном из подразделений менее 7 дней (56 часов)
    // берем значение по офису, на котором было отработано большее количество дней
    if (DataType(branch) == 'string') {
        return getValueFromBranch(data, branchCode)
    }

    // находим среднее значение
    if (isArray(branch)) {
        return getAverageValue(data, branch)
    }

    return null
}

//function calcThreeBranches(data) {
//    var DAYS = 5 // кол-во смен
//
//    var minMaxValues = getMinMaxValues(data, DAYS)
//}

function calcMetrics(data) {
    if (data.branches.length == 1) {
        return getValueFromBranch(data)
    }

    if (data.branches.length == 2) {
        return calcTwoBranches(data)
    }

    //if (data.branches.length == 3) {
    //    return calcThreeBranches(data)
    //}

    return null
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

/**
 * Извлекает ID из элементов списка и возвращает их строкой.
 * @param {object} list - Список объектов, каждый с полем 'id'.
 * @returns {string} Строка, содержащая ID, разделенные запятыми.
 */
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
 * @param {string} sql - Строка запроса для получения данных
 * @returns {number|null} Значение метрики или null, если не найдено.
 */
function getPersonMetric(person, branch, sql) {
    sql = StrReplace(sql, "{person}", person)
    sql = StrReplace(sql, "{branch}", branch)

    var metric = ArrayOptFirstElem(SQL_LIB.optXExec(sql, 'corecpu'))
    if (metric == undefined) {
        return 0
    }

    return OptInt(metric.fct, 0)
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
 * @param {object} listOfMetrics - Список метрик.
 * @returns {object} Объект с метриками ветки.
 */
function getBranchMetrics(branch, listOfMetrics) {
    if (METRICS_BRANCH.GetOptProperty(branch) != undefined) {
        return createObject(METRICS_BRANCH.GetOptProperty(branch))
    }

    METRICS_BRANCH[branch] = {}

    var query = getSqlMetricBranch(branch, listOfMetrics)
    var metrics = SQL_LIB.optXExec(query, 'corecpu')

    var metric, metricCode
    for (metric in metrics) {
        metricCode = listOfMetrics[String(metric.id)].code
        METRICS_BRANCH[branch][metricCode] = {
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

    var metricCode, sql
    for (metricCode in branchMetrics) {
        sql = getMetricFromCode(metricCode).GetOptProperty("sql")
        branchMetrics[metricCode]["person"] = getPersonMetric(person, branch, sql)
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

function getPersonId(code) {
    var query = "SELECT id FROM collaborators WHERE code = " + SqlLiteral(code)
    var persons = XQuery("sql: " + query)
    if (ArrayOptFirstElem(persons) == undefined) {
        return null
    }

    if (ArrayCount(persons) > 1) {
        return null
    }

    return ArrayOptFirstElem(persons).id
}

function isAdaptation(id, code) {
    var query = (
        "SELECT TOP 1 id \n" +
        "FROM career_reserves \n" +
        "WHERE person_id = " + SqlLiteral(id) + " \n" +
        "    AND code = " + SqlLiteral(code) + " \n" +
        "    AND status = 'active'"
    )

    var adaptations = XQuery("sql: " + query)
    if (ArrayOptFirstElem(adaptations) == undefined) {
        return false
    }

    return true
}

/**
 * Создает адаптации на основе предоставленных метрик.
 * @param {object} metrics - Объект с метриками по коду сотрудника.
 * @returns {Array} Массив созданных адаптаций.
 */
function createAdaptations(metrics) {
    var result = []

    var personCode, metric, personId, adaptation
    for (personCode in metrics) {
        addLog(" ")
        addLog(" ")
        addLog("Сотрудник: " + personCode)
        personId = getPersonId(personCode)
        //personId = 7147583355778132228
        if (personId == null) {
            //result.push("Сотрудник не найден.")
            addLog("Сотрудник не найден.")
            continue
        }
        addLog("personId: " + personId)

        metricsOfPerson = metrics.GetOptProperty(personCode, null)
        if (metricsOfPerson == null) {
            //result.push("Отсутствует метрика.")
            addLog("Отсутствует метрика.")
            continue
        }
        addLog("metricsOfPerson: " + tools.object_to_text(metricsOfPerson, 'json'))

        if (isAdaptation(personId, "razum_personal_sp")) {
            //result.push("Адаптация была назначена ранее.")
            addLog("Адаптация была назначена ранее.")
            continue
        }

        var education = ADAPTATION.createAdaptation(personId, {
            defaultProgId: 7231245838301082062,
            metrics: metricsOfPerson.result,
            adaptationDuration: 4,
            limit: 2,
        })

        result.push(education)
        addLog("Адаптация: " + tools.object_to_text(education, 'json'))
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
    addLog("Данные: " + tools.object_to_text(metricsOfBranches, 'json'))

    //var result = createAdaptations(metricsOfBranches[1])
    //addLog("Результат: " + tools.object_to_text(result, 'json'))
}

/**
 * Формирует SQL запрос для получения выручки.
 * @param {string} find - Метрика для поиска.
 * @returns {string} SQL запрос.
 */
function getSqlRevenue(find, begin, end) {
    return (
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
        "    and sa.user_tab_no = '{person}' \n" +
        "    and sa.branchcode = '{branch}' \n" +
        "    and sa.operation_date::date between " +
                        "date '" + begin + "' and date '" + end + "' \n" +
        "group by 1,2"
    )
}

/**
 * Генерирует SQL-запрос для получения данных о продажах.
 * @param {string} find - Категория для фильтрации данных (up_category).
 * @returns {string} Сформированный SQL-запрос.
 */
function getSqlGrossSim(find, begin, end) {
    return (
        "select sa.ym \n" +
        "    , sa.user_tab_no \n" +
        "    , sum(sa.qty) as fct \n" +
        "from core.t_asale as sa \n" +
        "where 1=1 \n" +
        "    and sa.up_category ilike '" + find + "' \n" +
        "    and sa.qty_up > 0 -- qty_up <> 0 -- с учетом возвратов \n" +
        "    and sa.user_tab_no = '{person}' \n" +
        "    and sa.branchcode = '{branch}' \n" +
        "    and sa.operation_date::date between " +
                        "date '" + begin + "' and date '" + end + "' \n" +
        "group by 1,2"
    )
}

/**
 * Возвращает список метрик с их описаниями.
 * @returns {object}
 */
function getListOfMetrics() {
    // TODO: поправь даты
    var begin = "2025-11-01"
    var end = "2025-11-30"

    return {
        "73": {
            code: "gross_sim",
            name: "Gross sim",
            sql: getSqlGrossSim("%сим-карта%", begin, end),
        },
        /*
        "303": {
            code: "product_revenue",
            name: "Товарная выручка",
            sql: getSqlRevenue("%товарная%", begin, end),
        },
        "304": {
            code: "finance_revenue",
            name: "Финансовая выручка",
            sql: getSqlRevenue("%финанс%", begin, end),
        },
        */
    }
}

/**
 * Получает метрику по ее коду.
 * @param {string} code - Код метрики.
 * @returns {object|null} Найденная метрика или null.
 */
function getMetricFromCode(code) {
    if (METRICS.GetOptProperty(code) != undefined) {
        return METRICS.GetOptProperty(code, null)
    }

    var metrics = getListOfMetrics()

    var id
    for (id in metrics) {
        if (metrics[id].code == code) {
            METRICS[code] = metrics[id]
            break
        }
    }

    return METRICS.GetOptProperty(code, null)
}

// entry point
// назначение/доназначение модульной программы
try {
    addLog("begin")

    var path = 'x-local://wt/web/custom_projects/libs/adaptation_lib.js'
    DropFormsCache('x-local://wt/web/custom_projects/libs/adaptation_lib.js')
    var ADAPTATION = OpenCodeLib(path)
    var SQL_LIB = OpenCodeLib("x-local://wt/web/custom_projects/libs/sql_lib.js")
    var SUBDIVISION = {}
    var METRICS_BRANCH = {}
    var METRICS = {}

    main(Param)

    addLog("end")
}
catch(err) {
    addLog('ERROR: ' + err)
}
