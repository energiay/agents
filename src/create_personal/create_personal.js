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
 * Получает типы должностей.
 * @returns {object} Объект, содержащий аббревиатуры и полные названия должностей.
 */
function getPositionType() {
    return {
        sp: "Специалист офиса",
        dm: "Директор магазина",
    }
}

function getEqual(type) {
    var TYPE = getPositionType()
    if (type == TYPE.sp) {
        return "="
    }

    if (type == TYPE.dm) {
        return "!="
    }

    return null
}

/**
 * Генерирует SQL-запрос для получения статистики по рабочим часам.
 * @param {object} params - Объект, содержащий параметры для формирования запроса.
 * @returns {string} Сформированный SQL-запрос.
 */
function getPersonsSql(params) {
    var tabNum = ",a.line_tab_num"
    if (params.GetOptProperty("type") == "subdivision") {
        tabNum = ""
    }

    var begin = params.begin
    var end = params.end + " 23:59:59"

    var equal = getEqual(params.position_type)
    if (equal == null) {
        throw "не задана должность: не могу получить статистику по рабочим дням"
    }

    var whereCodes = ""
    var codes = params.GetOptProperty("codes", "")
    if (codes != "") {
        whereCodes = "AND s.CODE_POINTS_SALE in (" + codes + " )"
    }

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
        "   AND e.oper_date >= '" + begin + "' \n" +
        "   AND e.oper_date <= '" + end + "' \n" +
        "   AND o.usage_mnemonic IN ('Я','ЯОО','ЯВ') " +
        "   " + whereCodes + " \n" +
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
        "where a.employee_unit " + equal + " 'Специалист' \n" +
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
 * Если код подразделения не передан, берем первое попавшееся подразделение.
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

    if (metrics == null) {
        return {}
    }

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
 * @param {object} branches - Подразделения.
 * @param {number} days - Количество дней.
 * @returns {object}
 */
function getMinMaxValues(branches, days) {
    var maxBranches = []
    var minBranches = []

    var branchCode
    for (branchCode in branches) {
        if (branchCode == "length") {
            continue
        }

        if (isDurationDays(branchCode, branches, days)) {
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
    if (metrics == null) {
        return null
    }

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

    if (sum == null) {
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
 * Определяет подразделение(я) с максимальной продолжительностью.
 * @param {object} list - Объект с любым количеством подразделений.
 * @returns {string|string[]|null} Код, массив кодов или null, если список пуст.
 */
function getMaxBranch(list) {
    var maxDuration = -1
    var winners = []

    // поиск максимальных значений
    var code, current
    for (code in list) {
        if (code == 'length') {
            continue
        }

        current = {code: code, duration: list[code].person_duration}

        // Нашли новый максимум
        if (current.duration > maxDuration) {
            // сбрасываем список победителей и записываем нового
            maxDuration = current.duration
            winners = [current.code]
            continue
        }

        // Если значение равно текущему максимуму - добавляем в список
        if (current.duration == maxDuration) {
            winners.push(current.code)
        }
    }

    if (ArrayCount(winners) == 0) {
        return null
    }

    // Если победитель один — возвращаем строку, если несколько — массив
    return (ArrayCount(winners) === 1 ? winners[0] : winners)
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
    var minMaxValues = getMinMaxValues(data.branches, DAYS)

    // среднее значение между офисами
    if (ArrayCount(minMaxValues.max) == 2) {
        return getAverageValue(data, minMaxValues.max)
    }

    // получаем код подразделения
    var branch = getMaxBranch(data.branches)

    // если хотя бы на одном из подразделений менее 7 смен:
    // берем значение по офису, на котором было отработано большее количество дней
    if (DataType(branch) == 'string') {
        return getValueFromBranch(data, branch)
    }

    // находим среднее значение
    if (isArray(branch)) {
        return getAverageValue(data, branch)
    }

    return null
}

function calcThreeBranches(data) {
    var DAYS = 5 // кол-во смен

    // Делим подразделения на: больше DAYS смен и меньше DAYS смен
    var minMaxValues = getMinMaxValues(data.branches, DAYS)

    // Если у всех трех подразделений DAYS и более смен
    if (ArrayCount(minMaxValues.max) == 3) {
        // среднее значение между офисами
        return getAverageValue(data, minMaxValues.max)
    }

    // получаем код(ы) подразделения(ий) для подсчета результата
    var branch = getMaxBranch(data.branches)

    // если хотя бы на одном из подразделений менее 5 смен:
    // берем значение по офису, на котором было отработано большее количество дней
    if (DataType(branch) == 'string') {
        return getValueFromBranch(data, branch)
    }

    // находим среднее значение
    if (isArray(branch)) {
        return getAverageValue(data, branch)
    }

    return null
}

function calcMetrics(data) {
    if (data.branches.length == 1) {
        return getValueFromBranch(data)
    }

    if (data.branches.length == 2) {
        return calcTwoBranches(data)
    }

    if (data.branches.length == 3) {
        return calcThreeBranches(data)
    }

    var branch = getMaxBranch(data.branches)

    if (DataType(branch) == 'string') {
        return getValueFromBranch(data, branch)
    }

    // находим среднее значение
    if (isArray(branch)) {
        return getAverageValue(data, branch)
    }

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
    if (metrics.GetOptProperty(personCode) == undefined) {
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
 * @param {object} params - Параметры выполнения функции.
 * @returns {array}
 */
function getMetricsOfBranches(params) {
    var calculate = {}
    var metrics = {}

    addLog("Получение списка сотрудников")
    var query = getPersonsSql(params)
    var persons = SQL_LIB.optXExec(query, 'corecpu')

    addLog("Подсчет результатов по сотрудникам")
    var person
    for (person in persons) {
        calculate = setDataPerson(calculate, person, params)
        metrics = setMetricsPerson(metrics, person, calculate)
    }

    return [calculate, metrics]
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
 * Формирует SQL-запрос для получения метрик по филиалу.
 * @param {object} params
 * @returns {string} SQL-запрос в виде строки.
 */
function getSqlMetricBranch(params) {
    var sMetrics = getMetricsFromList(params.list)

    var begin = params.begin
    var end = params.end + " 23:59:59"

    return (
        "\n" +
        "select distinct \n" +
        "    mt.description, \n" +
        "    dd.department_short_name AS branch_code, \n" +
        "    dm.metric_id AS id, \n" +
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
        "and dd.department_short_name is not null"
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
 * Проверяет, что переданное значение является объектом и у объекта есть поле/поля
 * @param {*} value - Проверяемое значение.
 * @returns {object|null} Объект иначе `null`.
 */
function optObj(value) {
    if (!isObject(value)) {
        return null
    }

    var field
    for (field in value) {
        return value
    }

    return null
}

/**
 * Получает факт сотрудника в филиале (по метрикам).
 * @param {string} person - Идентификатор сотрудника.
 * @param {string} branch - Идентификатор филиала.
 * @param {object} params - Параметры выполнения функции.
 * @returns {object} Объект с метриками филиала и сотрудника.
 */
function getPersonFact(person, branch, params) {
    var branchMetrics = params.filial_metrics.GetOptProperty(branch, {})

    // клонируем объект
    var result = createObject(branchMetrics)

    var metricCode, values, value, metric
    for (metricCode in result) {
        metric = params.list_of_metrics_code.GetOptProperty(metricCode, {})
        values = metric.GetOptProperty("values", {})
        value = values.GetOptProperty(person + "_" + branch, {})
        result[metricCode]["person"] = value.GetOptProperty("fct", 0)
    }

    return result
}

/**
 * Устанавливает данные о сотруднике в результирующий объект.
 * @param {object} result - Результирующий объект для добавления данных.
 * @param {object} person - Объект, содержащий данные о сотруднике.
 * @param {object} params - Параметры выполнения функции.
 * @returns {object} Обновленный результирующий объект.
 */
function setDataPerson(result, person, params) {
    var codePerson = String(person.line_tab_num)
    var persDuration = String(person.duration_vacation)

    var codeSubdiv = String(person.office_amdocs_code)
    var subDuration = params.filial_duration.GetOptProperty(codeSubdiv, null)
    var personFact = getPersonFact(codePerson, codeSubdiv, params)

    var checkPersson = result.GetOptProperty(codePerson)
    if (checkPersson == undefined) {
        result[codePerson] = {length: 0}
    }

    result[codePerson].length = result[codePerson].length + 1
    result[codePerson][codeSubdiv] = {
        person_duration: OptInt(persDuration, null),
        branch_duration: OptInt(subDuration.duration_vacation, null),
        metrics: personFact,
    }

    return result
}

function getPersonId(code) {
    var query = (
        "\n" +
        "SELECT id \n" +
        "FROM collaborators \n" +
        "WHERE is_dismiss = 0 \n" +
        "    AND code = " + SqlLiteral(code)
    )
    var persons = XQuery("sql: " + query)
    if (ArrayOptFirstElem(persons) == undefined) {
        addLog(query)
        return null
    }

    if (ArrayCount(persons) > 1) {
        addLog(query)
        return null
    }

    return ArrayOptFirstElem(persons).id
}

/**
 * Проверяет, назначена ли сотруднику программа адаптации
 * @param {number} person_id - Идентификатор сотрудника.
 * @param {number} program_id - Идентификатор типовой программы.
 * @returns {boolean} true, если у сотрудник есть назначенная адаптация.
 */
function isAdaptation(person_id, program_id) {
    var query = (
        "SELECT TOP 1 crs.id \n" +
        "FROM career_reserves AS crs \n" +
        "WHERE crs.person_id = " + SqlLiteral(person_id) + " \n" +
        "   AND crs.status = 'active'" +
        "   AND crs.code in (" +
                "SELECT ts.code " +
                "FROM typical_development_programs AS ts " +
                "WHERE ts.id = " + program_id +
            ") \n"
    )
    addLog(query)

    var adaptations = XQuery("sql: " + query)
    if (ArrayOptFirstElem(adaptations) == undefined) {
        return false
    }

    return true
}

/**
 * Создает адаптации на основе предоставленных метрик.
 * @param {object} metrics - Объект с метриками по коду сотрудника.
 * @param {object} params - Параметры выполнения функции.
 * @returns {Array} Массив созданных адаптаций.
 */
function createAdaptations(metrics, params) {
    var result = []
    var program = params.GetOptProperty("program")
    if (program == undefined) {
        throw "Треки обучения не назначены: на заданы параметры назначения."
    }

    var personCode, personId, education
    for (personCode in metrics) {
        addLog(" ")
        addLog(" ")
        personId = getPersonId(personCode)
        addLog("Сотрудник: " + personCode)
        personId = 7147583355778132228
        //personId = 6188032376454057749
        if (personId == null) {
            addLog("Сотрудник не найден, уволен или их найдено несколько.")
            continue
        }
        addLog("personId: " + personId)

        metricsOfPerson = metrics.GetOptProperty(personCode, null)
        if (metricsOfPerson == null) {
            addLog("Отсутствует метрика.")
            continue
        }
        addLog("metricsOfPerson: " + tools.object_to_text(metricsOfPerson, 'json'))

        if (isAdaptation(personId, program.def_progr_id)) {
            addLog("Адаптация была назначена ранее.")
            continue
        }

        addLog(tools.object_to_text(metricsOfPerson.result, "json"))

        //education = ADAPTATION.createAdaptation(personId, {
        //    defaultProgId: program.def_progr_id,
        //    metrics: metricsOfPerson.result,
        //    adaptationDuration: program.duration,
        //    limit: program.limit,
        //})

        //result.push(education)
        //addLog("Адаптация: " + tools.object_to_text(education, 'json'))

        sendMessage(personId)
        break
    }

    addLog(" ")
    addLog(" ")

    return result
}

function sendMessage(education) {
    addLog(personId)
}

/**
 * Главная функция
 * @param {object} params - Параметры выполнения функции.
 * @property {string} param.subs - Список подразделений, для подстановки в sql
 */
function main(params) {
    // Подсчет результатов
    var metricsOfBranches = getMetricsOfBranches(params)
    addLog("Результаты: " + tools.object_to_text(metricsOfBranches, 'json'))

    addLog("Создание треков обучения.")
    var result = createAdaptations(metricsOfBranches[1], params)
    addLog("Результат: " + tools.object_to_text(result, 'json'))
}

/**
 * Получает метрики продаж из таблицы t_asale.
 * @param {string} find - Поисковая строка для категории.
 * @param {number} ym - Год и месяц для фильтрации данных (например, 2512).
 * @param {string} fctField - Поле для расчета факта. По умолчанию 'sa.qty'.
 * @returns {object} Результат выполнения запроса.
 */
function getMetricOfTSales(find, ym, fctField) {
    var fct = fctField
    if (fct == undefined) {
        fct = "sa.qty"
    }

    var query = (
        "select \n" +
        "    sa.ym \n" +
        "    ,CONCAT(sa.user_tab_no, '_', sa.branchcode) as id \n" +
        "    ,sum(" + fct + ") as fct \n" +
        "from core.t_asale as sa \n" +
        "where 1=1 \n" +
        "    and sa.up_category ilike '" + find + "' \n" +
        "    and sa.qty_up > 0 -- qty_up <> 0 -- с учетом возвратов \n" +
        "    and sa.ym in (" + ym + ") \n" +
        "group by 1,2"
    )

    return  SQL_LIB.optXExec(query, 'corecpu', {field: "id"})
}

/**
 * Получает данные о выручке на основе заданных параметров.
 * @param {string} find - Критерий поиска для метрики.
 * @param {number} ym - Год и месяц для фильтрации данных (например, 2512).
 * @returns {object} Результат выполнения SQL-запроса с данными о выручке.
 */
function getMetricOfMotivation(find, ym) {
    var query = (
        "select \n" +
        "    sa.ym \n" +
        "    , CONCAT(sa.user_tab_no, '_', sa.branchcode) as id  \n" +
        "    , sum(coalesce(qty*full_price_rur, qty*(unit_price+discount))) " +
                                                                    "as fct \n" +
        "from core.t_asale as sa \n" +
        "join sb_motivation.dim_up_category_spec as mot on " +
                            "lower(mot.up_category) = lower(sa.up_category) \n" +
        "where 1=1 \n" +
        "    and mot.metric_name ilike '" + find + "' \n" +
        "    and sa.qty_up > 0 -- qty_up <> 0 -- с учетом возвратов  \n" +
        "    and sa.ym = " + ym + " \n" +
        "group by 1,2"
    )

    return  SQL_LIB.optXExec(query, 'corecpu', {field: "id"})
}

/**
 * Возвращает категории на основе переданного кода.
 * @param {string} code - Код для определения категорий.
 * @returns {string[]|null} Массив категорий или null, если код не найден.
 */
function getUpCateries(code) {
    if (code == 'gross_sim') {
        return [
            'Сим-карта (Яндекс+)'
            ,'Сим-карта (Тариф по запросу)'
            ,'Сим-карта'
            ,'Акционная сим-карта/пресет'
            ,'Сим-карта (годовой абонемент)'
        ]
    }

    if (code == 'shpd') {
        return ['ШПД (Подключение)']
    }

    if (code == 'product_revenue') {
        return [
            'Товарная группа 1: К1',
            'Товарная группа 1: К2',
            'Товарная группа 1: К3',
            'Товарная группа 1: К4',
            'Товарная группа 1: К5',
            'Товарная группа 1: К6',
            'Товарная группа 1: К7',
            'Товарная группа 1: К8',
            'Товарная группа 2: К1',
            'Товарная группа 2: К2',
            'Товарная группа 2: К3',
            'Товарная группа 2: К4',
            'Товарная группа 2: К5',
            'Товарная группа 2: К6',
            'Товарная группа 2: К7',
            'Продажа роутера ШПД с баланса телефона'
        ]
    }

    if (code == 'accessories') {
        return [
            'Товарная группа 2: К1',
            'Товарная группа 2: К2',
            'Товарная группа 2: К3',
            'Товарная группа 2: К4',
            'Товарная группа 2: К5',
            'Товарная группа 2: К6',
            'Товарная группа 2: К7'
        ]
    }

    if (code == 'finance_revenue') {
        return [
            'Консультация по установке приложений и активации программ',
            'Консультация по учетным записям телефона',
            'Настройка базовых функций телефона',
            'Пакет настроек Экспресс-настройка',
            'Пакет настроек Оптимальный',
            'Пакет настроек Премиум',
            'Пакет настроек Под ключ',
            'Пакет настроек базовый',
            'Пакет настроек функциональный',
            'Страхование жизни/здоровья',
            'Страхование покупки',
            'Аппаратная наклейка пленки'
        ]
    }

    return null
}

/**
 * Определяет, нужно ли измерять в рублях
 * @param {string} code - Код для проверки.
 * @returns {boolean}
 */
function isRur(code) {
    if (code == 'accessories') {
        return true
    }

    if (code == 'product_revenue') {
        return true
    }

    if (code == 'finance_revenue') {
        return true
    }

    return false
}

/**
 * Извлекает метрики `fct` по сотруднику на основе кода `code` и года-месяца `ym`.
 * @param {string} code - Код для определения категорий.
 * @param {(number|string)} ym - Год-месяц для фильтрации данных (например, 2603).
 * @returns {object} Результат выполнения SQL-запроса.
 */
function getMetricsFct(code, ym) {
    var upCategories = getUpCateries(code)
    if (upCategories == null) {
        throw "категории не определены: " + code
    }

    var field = "m.motivation_item_qty"
    if ( isRur(code) ) {
        field = "m.full_price_rur*m.motivation_item_qty"
    }

    var query = (
        "SELECT \n" +
        "    CONCAT(m.emp_tab_num, '_', m.office_code) as id, \n" +
        "    sum(" + field + ") as fct \n" +
        "FROM stage.motivation_monobrand_office_data_ext as m \n" +
        "where 1=1 \n" +
        "   --and m.office_code = '006000' \n" +
        "   -- исключаем возвраты и ... \n" +
        "   and m.motivation_flg = 1\n" +
        "   -- исключаем маркетплейсы \n" +
        "   and coalesce(m.order_src_code, '') not in (" +
               "'000000064'," +
               "'000000062'," +
               "'000000053'," +
               "'000000034'," +
               "'000000008'," +
               "'000000018'" +
            ") \n" +
        "   and m.ym = " + ym + " \n" +
        "   and m.up_category in (" +
                "'" + upCategories.join("','") + "'" +
            ") \n" +
        "group by 1"
    )
    //addLog(query)

    return  SQL_LIB.optXExec(query, 'corecpu', {field: "id"})
}


/**
 * Возвращает список метрик с их описаниями.
 * @param {string} ym - период извлечения данных (год и месяц)
 * @returns {object}
 */
function getListOfMetrics(ym) {
    return {
        "73": {
            code: "gross_sim",
            name: "Gross sim",
            values: getMetricsFct('gross_sim', ym),
        },
        "303": {
            code: "product_revenue",
            name: "Товарная выручка",
            values: getMetricsFct('product_revenue', ym)
        },
        "304": {
            code: "finance_revenue",
            name: "Финансовая выручка",
            values: getMetricsFct('finance_revenue', ym),
        },
        "305": {
            code: "shpd",
            name: "Продажи ШПД",
            values: getMetricsFct('shpd', ym),
        },
        "306": {
            code: "accessories",
            name: "Аксессуары",
            values: getMetricsFct('accessories', ym)
        },
    }
}

/**
 * Конвертируем метрики по id в метрики по коду
 * @param {object} list
 * @returns {object}
 */
function getMetricsFromCode(list) {
    var result = {}

    var id, code
    for (id in list) {
        code = list[id].code

        result[code] = list[id]
        result[code].id = id
    }

    return result
}

/**
 * Получает метрики по всем филиалам.
 * @param {object} params
 * @returns {object} Объект с метриками филиалов.
 */
function getBranchesMetrics(params) {
    var result = {}

    var query = getSqlMetricBranch(params)
    var metrics = SQL_LIB.optXExec(query, 'corecpu')

    var metric, metricCode, branchCode
    for (metric in metrics) {
        branchCode = String(metric.branch_code)
        if (result.GetOptProperty(branchCode) == undefined) {
            result[branchCode] = {}
        }

        metricCode = params.list[String(metric.id)].code
        result[branchCode][metricCode] = {
            branch: OptInt(metric.value, null),
        }
    }

    return result
}

/**
 * Возвращает продолжительность работы подразделений.
 * @param {object} params
 * @returns {object}
 */
function getSubsDuration(params) {
    var query = getPersonsSql(params)
    var settings = {field: "office_amdocs_code"}

    return SQL_LIB.optXExec(query, 'corecpu', settings)
}

/**
 * Получает год и месяц в формате 'ГГММ' из переданной даты.
 * @param {Date|string} date - Исходная дата для обработки.
 * @returns {string} Строка, содержащая год и месяц в формате 'ГГММ'.
 */
function getYearMonth(date) {
    var dDate = Date(date)

    var sMonth = ""
    var month = Month(dDate)
    if (month < 10) {
        sMonth = "0" + month
    } else {
        sMonth = month + ""
    }

    return StrCharRangePos(String(Year(dDate)), 2, 4) + sMonth
}

// entry point
// назначение/доназначение модульной программы
try {
    addLog("begin")

    var path = 'x-local://wt/web/custom_projects/libs/adaptation_lib.js'
    var ADAPTATION = OpenCodeLib(path)
    var SQL_LIB = OpenCodeLib("x-local://wt/web/custom_projects/libs/sql_lib.js")

    // TODO: период
    var begin = "2026-02-01"
    var end = "2026-02-28"
    var ym = getYearMonth(begin)

    addLog("Получение параметров")

    // список метрик
    var LIST_OF_METRICS = getListOfMetrics(ym) // по id
    var LIST_OF_METRICS_CODE = getMetricsFromCode(LIST_OF_METRICS) // по коду
    //addLog(tools.object_to_text(LIST_OF_METRICS, "json"))
    //addLog(tools.object_to_text(LIST_OF_METRICS_CODE, "json"))

    // метрики по филиалам за период
    var METRICS_FILIAL = getBranchesMetrics({
        list: LIST_OF_METRICS,
        begin: begin,
        end: end,
    })

    var TYPE = getPositionType()

    // время работы офиса
    var SUBS_DURATION = getSubsDuration({
        codes: Param.subs,
        begin: begin,
        end: end,
        type: "subdivision",
        position_type: TYPE.sp,
    })


    main({
        codes: Param.subs,
        begin: begin,
        end: end,
        list_of_metrics: LIST_OF_METRICS,
        list_of_metrics_code: LIST_OF_METRICS_CODE,
        filial_metrics: METRICS_FILIAL,
        filial_duration: SUBS_DURATION,
        position_type: TYPE.sp,
        program: {
            def_progr_id: 7231245838301082062,
            duration: 7,
            limit: 2,
        }
    })

    addLog("end")
}
catch(err) {
    addLog('ERROR: ' + err)
}
