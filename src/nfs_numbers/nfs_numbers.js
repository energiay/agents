/**
 * Логирование
 * @param {string} value - значение для логирования
 * @param {string} name - название файла лога
 */
function addLog(value, name) {
    var sLogName = name
    if (sLogName == undefined) {
        sLogName = 'nfs_numbers'
    }

    EnableLog(sLogName)
    LogEvent(sLogName, value)
}

/**
 * Получает данные из НФС
 * @returns {array}
 */
function getData() {
    //DropFormsCache("x-local://wt/web/custom_projects/libs/sql_lib_dev.js")
    var sql_lib = OpenCodeLib("x-local://wt/web/custom_projects/libs/sql_lib.js")

    var ssql = (
        "SELECT Trunc(Sysdate) discharge_base_date, t.* \n" +
        "FROM TABLE ( \n" +
        "    xxvip_hr_mono_employee_pkg.get_employees ( \n" +
        "        p_date            => trunc(Sysdate) \n" +
        "    ) \n" +
        ")  t"
        //"--FETCH FIRST 3 ROWS ONLY;"
    )

    return sql_lib.optXExec(ssql, 'nfs_numbers')
}

/**
 * Генерирует строку с названиями полей для SQL-запроса INSERT.
 * @returns {string} Строка с названиями полей.
 */
function getInsertFields(data) {
    return (
        "discharge_base_date, " +
        "region, " +
        "filial, " +
        "city, " +
        "area, " +
        "locality, " +
        "cbo, " +
        "assignment_number, " +
        "employee_number, " +
        "full_name, " +
        "group_code, " +
        "group_name, " +
        "hire_date, " +
        "objective_position_start_date, " +
        "fire_date, " +
        "objective_position_code, " +
        "objective_position_name, " +
        "position_name, " +
        "position_id, " +
        "person_id, " +
        "assignment_id "
    )
}

/**
 * Вставляет записи в таблицу c_nfs_numbers.
 * @param {array} data -данные для вставки.
 * @returns {number} Количеством добавленных строк
 */
function addRecord(data) {
    var insertFields = getInsertFields()
    var query = (
        "\n" +
        "INSERT INTO [WTDB].[dbo].[c_nfs_numbers] \n" +
        "   (" + insertFields + ") \n" +
        "VALUES \n" +
        "   (" + data.join("), (") + ")\n" +
        "SELECT @@ROWCOUNT AS 'rowcount'"
    )

    //addLog(query)

    var result = ArrayOptFirstElem(XQuery("sql: " + query))
    var count = OptInt(result.GetOptProperty("rowcount"), 0)

    addLog("Добавлено записей: " + count)

    return count
}

/**
 * Формирует строку значений для SQL-запроса INSERT.
 * @param {object} rec - Объект записи с данными.
 * @returns {string} Строка отформатированных значений для SQL-запроса.
 */
function getInsertData(rec) {
    var discharge_base_date = rec.GetOptProperty("DISCHARGE_BASE_DATE")
    var hire_date = rec.GetOptProperty("HIRE_DATE")
    var obj_pos_start_date = rec.GetOptProperty("OBJECTIVE_POSITION_START_DATE")
    var fire_date = rec.GetOptProperty("FIRE_DATE")

    return (
        "CONVERT(datetime2, '" + discharge_base_date + "', 104)" + "," +
        "'" + rec.GetOptProperty("REGION") + "', " +
        "'" + rec.GetOptProperty("FILIAL") + "', " +
        "'" + rec.GetOptProperty("CITY") + "', " +
        "'" + rec.GetOptProperty("AREA") + "', " +
        "'" + rec.GetOptProperty("LOCALITY") + "', " +
        "'" + rec.GetOptProperty("CBO") + "', " +
        "'" + rec.GetOptProperty("ASSIGNMENT_NUMBER") + "', " +
        "'" + rec.GetOptProperty("EMPLOYEE_NUMBER") + "', " +
        "'" + rec.GetOptProperty("FULL_NAME") + "', " +
        "'" + rec.GetOptProperty("GROUP_CODE") + "', " +
        "'" + rec.GetOptProperty("GROUP_NAME") + "', " +
        "CONVERT(datetime2, '" + hire_date + "', 104)" + "," +
        "CONVERT(datetime2, '" + obj_pos_start_date + "', 104)" + "," +
        "CONVERT(datetime2, '" + fire_date + "', 104)" + "," +
        "'" + rec.GetOptProperty("OBJECTIVE_POSITION_CODE") + "', " +
        "'" + rec.GetOptProperty("OBJECTIVE_POSITION_NAME") + "', " +
        "'" + rec.GetOptProperty("POSITION_NAME") + "', " +
        "" + rec.GetOptProperty("POSITION_ID") + ", " +
        "" + rec.GetOptProperty("PERSON_ID") + ", " +
        "" + rec.GetOptProperty("ASSIGNMENT_ID")
    )
}

/**
 * Обрабатывает и добавляет записи данных из НФС в LMS.
 */
function load() {
    var data = getData() // данные из НФС

    var i = 0
    var insertDatas = []

    var record, insertData
    for (record in data) {
        i++

        // получаем записи и конвертируем их для добавления в БД
        insertData = getInsertData(record)
        insertDatas.push(insertData)

        // добавляем по 900 записей
        if (i >= 900) {
            addRecord(insertDatas)  // добавляем записи в БД
            i = 0                   // обнуляем счетчик
            insertDatas = []        // обнуляем данные
        }
    }

    // добавляем остатки записей
    if (ArrayOptFirstElem(insertDatas) != undefined) {
        addRecord(insertDatas)
    }
}

/**
 * Очищает таблицу [WTDB].[dbo].[c_nfs_numbers].
 */
function clear() {
    var query = "TRUNCATE TABLE [WTDB].[dbo].[c_nfs_numbers]"
    ArrayOptFirstElem(XQuery("sql: " + query))
}


//entry point
try {
    addLog("begin")

    clear()
    load()

    addLog("end")
}
catch(err) {
    addLog("ERROR: " + err)
}
