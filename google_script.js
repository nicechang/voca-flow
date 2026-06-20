/**
 * Google Apps Script for English Memorizer App
 * 
 * Instructions:
 * 1. Open a Google Spreadsheet.
 * 2. Click "Extensions" -> "Apps Script".
 * 3. Replace all code in the script editor with this code.
 * 4. Click "Save" (disk icon).
 * 5. Click "Deploy" -> "New deployment".
 * 6. Select type "Web app".
 * 7. Set "Execute as" to "Me".
 * 8. Set "Who has access" to "Anyone".
 * 9. Click "Deploy", authorize the permissions, and copy the "Web app URL".
 * 10. Paste the URL into the app's Settings!
 */

// Initialize sheets and headers if they don't exist
function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Words Sheet
  var wordsSheet = ss.getSheetByName("Words");
  if (!wordsSheet) {
    wordsSheet = ss.insertSheet("Words");
    var headers = [
      "id", "word", "meaning", "nuance", "synonyms", 
      "expressions", "correct_count", "incorrect_count", 
      "status", "last_reviewed", "created_at", "memory_tip"
    ];
    wordsSheet.appendRow(headers);
    wordsSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  
  // 2. QuizLogs Sheet
  var logsSheet = ss.getSheetByName("QuizLogs");
  if (!logsSheet) {
    logsSheet = ss.insertSheet("QuizLogs");
    var headers = ["id", "word_id", "word", "result", "quiz_type", "timestamp"];
    logsSheet.appendRow(headers);
    logsSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
}

// Helper to convert sheet data to array of objects
function getSheetData(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  
  var headers = rows[0];
  var data = [];
  
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    data.push(obj);
  }
  
  return data;
}

// Helper to write objects to sheet (overwriting or appending)
function writeSheetData(sheetName, dataList, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  
  sheet.clearContents();
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  
  if (dataList.length === 0) return;
  
  var values = [];
  for (var i = 0; i < dataList.length; i++) {
    var obj = dataList[i];
    var row = [];
    for (var j = 0; j < headers.length; j++) {
      var val = obj[headers[j]];
      row.push(val !== undefined ? val : "");
    }
    values.push(row);
  }
  
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

// Handle GET requests
function doGet(e) {
  initSheets();
  var action = e.parameter.action;
  
  // Enable CORS
  var output = ContentService.createTextOutput();
  
  try {
    if (action === "getWords") {
      var data = getSheetData("Words");
      return ContentService.createTextOutput(JSON.stringify(data))
                           .setMimeType(ContentService.MimeType.JSON);
    } 
    else if (action === "getLogs") {
      var data = getSheetData("QuizLogs");
      return ContentService.createTextOutput(JSON.stringify(data))
                           .setMimeType(ContentService.MimeType.JSON);
    } 
    else if (action === "searchNaver") {
      var query = e.parameter.query;
      var url = "https://dict.naver.com/api3/enko/search?query=" + encodeURIComponent(query) + "&m=pc";
      var response = UrlFetchApp.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*'
        },
        muteHttpExceptions: true
      });
      return ContentService.createTextOutput(response.getContentText())
                           .setMimeType(ContentService.MimeType.JSON);
    } 
    else {
      return ContentService.createTextOutput(JSON.stringify({ error: "Unknown action" }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle POST requests
function doPost(e) {
  initSheets();
  
  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === "addWord") {
      var wordData = postData.word;
      var sheet = ss.getSheetByName("Words");
      var data = getSheetData("Words");
      
      var foundIndex = -1;
      for (var i = 0; i < data.length; i++) {
        if (data[i].id === wordData.id || data[i].word.toLowerCase() === wordData.word.toLowerCase()) {
          foundIndex = i;
          break;
        }
      }
      
      var headers = [
        "id", "word", "meaning", "nuance", "synonyms", 
        "expressions", "correct_count", "incorrect_count", 
        "status", "last_reviewed", "created_at", "memory_tip"
      ];
      
      if (foundIndex > -1) {
        // Update existing word
        data[foundIndex] = wordData;
        writeSheetData("Words", data, headers);
      } else {
        // Append new word
        var row = [];
        for (var j = 0; j < headers.length; j++) {
          row.push(wordData[headers[j]] !== undefined ? wordData[headers[j]] : "");
        }
        sheet.appendRow(row);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (action === "deleteWord") {
      var wordId = postData.id;
      var data = getSheetData("Words");
      var headers = [
        "id", "word", "meaning", "nuance", "synonyms", 
        "expressions", "correct_count", "incorrect_count", 
        "status", "last_reviewed", "created_at", "memory_tip"
      ];
      
      var filtered = data.filter(function(w) { return w.id !== wordId; });
      writeSheetData("Words", filtered, headers);
      
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (action === "addLog") {
      var logData = postData.log;
      var logHeaders = ["id", "word_id", "word", "result", "quiz_type", "timestamp"];
      var logsSheet = ss.getSheetByName("QuizLogs");
      
      // Append quiz log
      var row = [];
      for (var j = 0; j < logHeaders.length; j++) {
        row.push(logData[logHeaders[j]] !== undefined ? logData[logHeaders[j]] : "");
      }
      logsSheet.appendRow(row);
      
      // Update correct/incorrect count and status in Words sheet
      var wordsData = getSheetData("Words");
      var wordHeaders = [
        "id", "word", "meaning", "nuance", "synonyms", 
        "expressions", "correct_count", "incorrect_count", 
        "status", "last_reviewed", "created_at", "memory_tip"
      ];
      
      for (var i = 0; i < wordsData.length; i++) {
        if (wordsData[i].id === logData.word_id) {
          var correct = parseInt(wordsData[i].correct_count || 0);
          var incorrect = parseInt(wordsData[i].incorrect_count || 0);
          
          if (logData.result === "Correct") {
            correct++;
          } else {
            incorrect++;
          }
          
          wordsData[i].correct_count = correct;
          wordsData[i].incorrect_count = incorrect;
          wordsData[i].last_reviewed = logData.timestamp;
          
          // Recalculate status
          var total = correct + incorrect;
          var rate = correct / total;
          if (total >= 3 && rate >= 0.8) {
            wordsData[i].status = "Memorized";
          } else if (rate < 0.5) {
            wordsData[i].status = "Weak";
          } else {
            wordsData[i].status = "Learning";
          }
          break;
        }
      }
      writeSheetData("Words", wordsData, wordHeaders);
      
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (action === "sync") {
      // Full two-way sync: Merge client data with sheet data
      var clientWords = postData.words || [];
      var clientLogs = postData.logs || [];
      
      var sheetWords = getSheetData("Words");
      var sheetLogs = getSheetData("QuizLogs");
      
      var wordHeaders = [
        "id", "word", "meaning", "nuance", "synonyms", 
        "expressions", "correct_count", "incorrect_count", 
        "status", "last_reviewed", "created_at", "memory_tip"
      ];
      var logHeaders = ["id", "word_id", "word", "result", "quiz_type", "timestamp"];
      
      // 1. Merge Words
      var mergedWordsMap = {};
      
      // Load sheet words
      sheetWords.forEach(function(w) {
        mergedWordsMap[w.id] = w;
      });
      
      // Merge client words
      clientWords.forEach(function(cw) {
        var sw = mergedWordsMap[cw.id];
        if (!sw) {
          // Client has new word, add it
          mergedWordsMap[cw.id] = cw;
        } else {
          // Both have it, compare last_reviewed or correct_count
          var swTime = sw.last_reviewed ? new Date(sw.last_reviewed).getTime() : 0;
          var cwTime = cw.last_reviewed ? new Date(cw.last_reviewed).getTime() : 0;
          
          // If never reviewed, compare created_at
          if (swTime === 0 && cwTime === 0) {
            var swCreate = sw.created_at ? new Date(sw.created_at).getTime() : 0;
            var cwCreate = cw.created_at ? new Date(cw.created_at).getTime() : 0;
            if (cwCreate > swCreate) {
              mergedWordsMap[cw.id] = cw;
            }
          } 
          // Keep the one with the newer review timestamp
          else if (cwTime > swTime) {
            mergedWordsMap[cw.id] = cw;
          }
        }
      });
      
      var mergedWords = Object.keys(mergedWordsMap).map(function(k) { return mergedWordsMap[k]; });
      writeSheetData("Words", mergedWords, wordHeaders);
      
      // 2. Merge Logs (simple union by id)
      var mergedLogsMap = {};
      sheetLogs.forEach(function(l) { mergedLogsMap[l.id] = l; });
      clientLogs.forEach(function(l) { mergedLogsMap[l.id] = l; });
      
      var mergedLogs = Object.keys(mergedLogsMap).map(function(k) { return mergedLogsMap[k]; });
      // Sort logs by timestamp ascending
      mergedLogs.sort(function(a, b) {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
      writeSheetData("QuizLogs", mergedLogs, logHeaders);
      
      // Return merged database back to client
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        words: mergedWords,
        logs: mergedLogs
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    else {
      return ContentService.createTextOutput(JSON.stringify({ error: "Unknown action" }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
