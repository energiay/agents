/**
 * Логирование
 * @param {string} value - значение для логирования
 * @param {string} name - название файла лога
 */
function addLog(value, name) {
    var sLogName = name
    if (sLogName == undefined) {
        sLogName = "recovery_doc"
    }

    EnableLog(sLogName)
    LogEvent(sLogName, value)
}

/**
 * Проверяем наличие документа в корзине
 * @param {integer} id - идентификатор удаленного документа
 */
function isTrash(id) {
    var ssql = "SELECT * FROM [trash_docs] WHERE id=" + id
    var elemDelDoc = XQuery("sql: " + ssql)
    if (ArrayCount(elemDelDoc) != 1) {
        addLog("id документа не найден в корзине: " + ssql)
        return false
    }

    return true
}

/**
 * Восстановление документа
 * @param {string} id - идентификатор удаленного документа
 */
function recovery(id) {
    var iDocId = Int(id)
    addLog("Начинаем восстановление документа с id: " + iDocId + " (" + id + ")")

    // проверяем наличие документа в корзине
    if (isTrash(iDocId)) {
        // удаляем документ из корзины
        var ssql_del = "DELETE [trash_docs] WHERE id=" + iDocId
        ArrayOptFirstElem(XQuery("sql: " + ssql_del))
        addLog("Документ удален из корзины " + ssql_del)
    }

    // подготавливаем документ к восстановлению
    var ssql = "UPDATE [(spxml_objects)] SET is_deleted=NULL WHERE id=" + iDocId
    ArrayOptFirstElem(XQuery("sql: " + ssql))

    // восстанавливаем запись в индексированной таблице
    var doc = OpenDoc(UrlFromDocID(iDocId))
    doc.Save()

    addLog("Документ восстановлен")
}

/**
 * Главная функция
 * @param {string} id - идентификатор удаленного документа
 */
function main(id) {
    var ssql_cast_id = "SELECT CAST(" + id + " AS bigint) AS id"
    var ids = XQuery("sql: " + ssql_cast_id)
    if (ArrayOptFirstElem(ids) == undefined) {
        var message = "Ошибка: не удалось преобразовать id в десятичное значение: "
        addLog(message + id)
        return
    }

    recovery(id)
}

// entry point
try {
    addLog("begin")
    main(Param.id)
    addLog("end")
} catch (err) {
    addLog("ERROR: " + err)
}
