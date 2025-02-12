/**
 * Логирование
 * @param {string} value - значение для логирования
 * @param {string} name - название файла лога
 */
function addLog(value, name) {
    var sLogName = name
    if (sLogName == undefined) {
        sLogName = 'create_package'
    }

    EnableLog(sLogName)
    LogEvent(sLogName, value)
}


/**
 * Распарсить json
 * @param {string} json
 * @param {any} defaultValue
 * @param {any}
 */
function parseOptJson(json, defaultValue) {
    try {
        return ParseJson(json)
    } catch (err) {}

    return defaultValue
}


/**
 * Получить директорию
 * @param {string} file
 * @return {string}
 */
function getDirectory(file) {
    if (file == "") {
        return ""
    }

    var result = ""
    var chanks = String(file).split("/")
    var length = ArrayCount(chanks)

    var i
    for(i = 0; i < length-1; i++) {
        result += chanks[i] + "/"
    }

    return result
}


/**
 * Получить полный путь расположения файла
 * @param {string} file
 * @return {string}
 */
function getPathToFile(file) {
    var dir = getDirectory(file)
    if ( !IsDirectory(dir) ) {
        return ""
    }

    var curDate = Date()
    var year = Year(curDate)
    var month = StrInt(Month(curDate), 2)
    var day = StrInt(Day(curDate), 2)
    var hour = StrInt(Hour(curDate), 2)
    var minute = StrInt(Minute(curDate), 2)
    var second = StrInt(Second(curDate), 2)

    return (
        settings.file +
        "_" + year +
        "_" + month +
        "_" + day +
        "_" + hour +
        "_" + minute +
        "_" + second +
        "_" + GetCurTicks() + ".zip"
    )
}


/**
 * Преобразование параметров потока в окончательный вид
 * @param {object} settings
 * @return {object}
 */
function getParams(settings) {
    var params = {success: true}

    // парсим JSON
    params.targets = parseOptJson(settings.targets, [])
    if (ArrayOptFirstElem(params.targets) == undefined) {
        params.success = false
        params.error = "Не заданы идентификаторы объектов для бекапа"

        return params
    }


    // получаем путь для сохранения файла
    //var path = "x-local://wt/web/backup/backup_" + tools.date_str() + ".zip"
    params.file = getPathToFile(settings.file)
    if (params.file == "") {
        params.success = false
        params.error = "Не удалось найти путь для создания файла"

        return params
    }

    return params
}


/**
 * Запуск обработки потока
 * @param {object} settings
*/
function run(settings) {
    var params = getParams(settings)
    if (!params.success) {
        addLog(params.error)
        return
    }

    var packageObjects = tools.new_doc_by_name("package_objects")
    var child = packageObjects.TopElem.AddChild()

    var id
    for (id in params.targets) {
        child.objects.ObtainChildByKey(id)
    }

    var backup = ArrayOptFirstElem(packageObjects.TopElem.package_object)
    tools.create_list_package(params.file, backup)
}




// enrty point
try {
    var threads = parseOptJson(Param.threads, [])

    var thread
    for(thread in threads) {
        if (thread.enabled != "true") {
            continue
        }

        run(thread)
    }
}
catch (err) {
    addLog("ERROR: " + err)
}
