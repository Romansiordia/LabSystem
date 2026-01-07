
import React, { useState } from 'react';

const appsScriptCode = `
/**
 * LabSys - Google Apps Script Backend
 * Author: Your World-Class Senior Frontend Engineer
 * Version: 7.0 (Admin Authentication)
 * Description: This script provides a robust backend for the LabSys web app.
 * This version introduces a secure login for the administrator panel.
 */

// --- SECURITY CONFIGURATION ---
// !!! IMPORTANT: Change this password to a strong, unique value! !!!
const ADMIN_PASSWORD = "LabSys2024!"; 

// --- END OF CONFIGURATION ---


function doGet(e) {
  try {
    const clientId = e.parameter.clientId;
    let response;

    if (clientId) {
      // If a clientId is provided, return only data relevant to that client.
      response = {
        analysisResults: getSheetDataAsObjects("AnalysisResults", clientId)
      };
    } else {
      // Otherwise, return all data for the admin portal.
      response = {
        clients: getSheetDataAsObjects("Clients"),
        technicians: getSheetDataAsObjects("Technicians"),
        analysisTypes: getSheetDataAsObjects("AnalysisTypes"),
        analysisCosts: getSheetDataAsObjects("AnalysisCosts"),
        analysisResults: getSheetDataAsObjects("AnalysisResults")
      };
    }

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log("doGet Error: " + error.stack);
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "doGet Error: " + error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


function doPost(e) {
  try {
    if (!e || !e.parameter || !e.parameter.payload) throw new Error("Invalid POST: 'payload' missing.");
    const request = JSON.parse(e.parameter.payload);
    const { action, targetSheet, payload } = request;

    // Handle non-sheet actions first
    if (action === 'testConnection') return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Connection successful." })).setMimeType(ContentService.MimeType.JSON);
    if (action === 'authenticateClient') return handleClientAuthentication(payload);
    if (action === 'authenticateAdmin') return handleAdminAuthentication(payload);


    // All actions below require a valid sheet
    if (!action || !targetSheet || !payload) throw new Error("Request requires 'action', 'targetSheet', 'payload'.");

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(targetSheet);
    if (!sheet) throw new Error("Sheet '" + targetSheet + "' not found. Check name (case-sensitive).");
    
    switch (action) {
      case 'delete':
        return handleDelete(payload, sheet);
      case 'create':
      case 'update':
        return handleUpsert(payload, sheet);
      default:
        throw new Error("Unknown action: '" + action + "'.");
    }
  } catch (error) {
    Logger.log("doPost Error: " + error.stack + " | Payload: " + (e.parameter ? e.parameter.payload : "N/A"));
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleAdminAuthentication(payload) {
  const { password } = payload;
  if (!password) throw new Error("Admin authentication requires a 'password'.");

  if (password === ADMIN_PASSWORD) {
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } else {
    throw new Error("Invalid admin password.");
  }
}

function handleClientAuthentication(payload) {
  const { username, password } = payload;
  if (!username || !password) throw new Error("Authentication requires 'username' and 'password'.");

  const loginSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ClientLogins");
  if (!loginSheet) throw new Error("Sheet 'ClientLogins' not found.");

  const loginData = loginSheet.getDataRange().getValues();
  const headers = loginData.shift().map(h => String(h).toLowerCase());
  const userIndex = headers.indexOf('username');
  const passIndex = headers.indexOf('password');
  const clientIdIndex = headers.indexOf('clientid');
  
  if (userIndex === -1 || passIndex === -1 || clientIdIndex === -1) {
    throw new Error("'ClientLogins' sheet must contain 'clientId', 'username', and 'password' headers.");
  }
  
  for (let i = 0; i < loginData.length; i++) {
    if (loginData[i][userIndex] == username && loginData[i][passIndex] == password) {
      const clientId = loginData[i][clientIdIndex];
      const clients = getSheetDataAsObjects("Clients");
      const client = clients.find(c => c.id == clientId);
      
      if (!client) throw new Error("Authenticated client ID '" + clientId + "' not found in 'Clients' sheet.");

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        client: { id: client.id, name: client.name }
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  throw new Error("Invalid username or password.");
}


function handleUpsert(data, sheet) {
  Logger.log("handleUpsert for sheet '" + sheet.getName() + "'. ID: " + data.id + ".");
  if (!data.id) throw new Error("Upsert payload needs 'id'.");
  if (sheet.getLastRow() === 0) throw new Error("Cannot save to empty sheet. Add headers.");

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const lowerCaseHeaders = headers.map(h => h.toLowerCase());
  const idColumnIndex = lowerCaseHeaders.indexOf('id');
  if (idColumnIndex === -1) throw new Error("'id' column not found in sheet '" + sheet.getName() + "'.");
  
  const dataKeys = Object.keys(data).reduce((acc, key) => { acc[key.toLowerCase()] = key; return acc; }, {});

  let rowData;
  try {
    rowData = headers.map(header => {
      const lowerHeader = header.toLowerCase();
      let value = undefined;

      const originalKey = dataKeys[lowerHeader];
      if (originalKey) {
        value = data[originalKey];
      }

      if (sheet.getName() === 'AnalysisResults' && value === undefined) {
         const resultItem = (data.results || []).find(r => String(r.testName).trim() === header);
         if (resultItem) {
           value = resultItem.value;
         }
      }
      
      if (Array.isArray(value)) return value.join(',');
      return (value !== null && value !== undefined) ? value : "";
    });
  } catch (e) {
    Logger.log("Error preparing rowData for ID " + data.id + ". Error: " + e.stack);
    throw new Error("Data processing failed. Error: " + e.message);
  }

  const sheetData = sheet.getDataRange().getValues();
  let recordUpdated = false;

  for (let i = 1; i < sheetData.length; i++) {
    if (String(sheetData[i][idColumnIndex]).trim() == String(data.id).trim()) {
      Logger.log("Found matching ID " + data.id + " at row " + (i + 1) + ". Updating.");
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([rowData]);
      recordUpdated = true;
      break;
    }
  }

  if (!recordUpdated) {
    Logger.log("No ID " + data.id + " found. Appending new row.");
    sheet.appendRow(rowData);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Data saved successfully." }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleDelete(data, sheet) {
  if (!data.id) {
    throw new Error("Delete action requires an 'id' in the payload.");
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase().trim());
  const idColumnIndex = headers.indexOf('id');

  if (idColumnIndex === -1) {
    throw new Error("Cannot delete: target sheet must have an 'id' column.");
  }
  const sheetData = sheet.getDataRange().getValues();
  for (let i = sheetData.length - 1; i >= 1; i--) {
    if (sheetData[i][idColumnIndex] == data.id) {
      sheet.deleteRow(i + 1);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Row deleted successfully from " + sheet.getName() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Row already deleted or not found." }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetDataAsObjects(sheetName, filterClientId = null) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data.shift().map(h => String(h).trim());

  const camelCaseMap = { 'contactperson': 'contactPerson', 'hiredate': 'hireDate', 'testname': 'testName', 'resulttype': 'resultType', 'receptiondate': 'receptionDate', 'deliverydate': 'deliveryDate', 'samplename': 'sampleName', 'clientid': 'clientId', 'technicianid': 'technicianId', 'requestedtests': 'requestedTests' };

  if (sheetName !== "AnalysisResults") {
      const numericHeaders = ['cost'];
      return data.map(row => {
          const obj = {};
          headers.forEach((header, index) => {
              const lowerHeader = header.toLowerCase();
              let value = row[index];
              if (numericHeaders.includes(lowerHeader) && value !== '' && !isNaN(value)) {
                  value = Number(value);
              }
              const key = camelCaseMap[lowerHeader] || lowerHeader;
              obj[key] = value;
          });
          return obj;
      });
  }

  const fixedColumns = new Set(['id', 'folio', 'receptiondate', 'deliverydate', 'samplename', 'product', 'subtype', 'clientid', 'technicianid', 'priority', 'status', 'cost', 'requestedtests']);
  const clientIdColumnIndex = headers.map(h => h.toLowerCase()).indexOf('clientid');
  
  if (filterClientId && clientIdColumnIndex === -1) {
    Logger.log("Warning: Cannot filter AnalysisResults by clientId because 'clientId' column was not found.");
    return [];
  }
  
  const results = data.reduce((acc, row) => {
    if (filterClientId && row[clientIdColumnIndex] != filterClientId) {
      return acc;
    }
    
    const analysisObj = { results: [] };
    headers.forEach((header, index) => {
      let value = row[index];
      const lowerHeader = header.toLowerCase();
      
      if (fixedColumns.has(lowerHeader)) {
        const key = camelCaseMap[lowerHeader] || lowerHeader;
        if (key === 'requestedTests' && typeof value === 'string') {
          analysisObj[key] = value ? value.split(',').map(item => item.trim()) : [];
        } else if (key === 'cost' && value !== '' && !isNaN(value)) {
          analysisObj[key] = Number(value);
        } else {
          analysisObj[key] = value;
        }
      } else {
          if(value !== null && value !== undefined && value !== '') {
            let numericValue = Number(value);
            analysisObj.results.push({
              testName: header,
              value: (String(value).trim() === '' || isNaN(numericValue)) ? value : numericValue
            });
          }
      }
    });
    acc.push(analysisObj);
    return acc;
  }, []);

  return results;
}
`.trim();

const CodeBlock: React.FC = () => {
    const [copyStatus, setCopyStatus] = useState('Copy');

    const handleCopy = () => {
        navigator.clipboard.writeText(appsScriptCode).then(() => {
            setCopyStatus('Copied!');
            setTimeout(() => setCopyStatus('Copy'), 2000);
        }, () => {
            setCopyStatus('Failed!');
            setTimeout(() => setCopyStatus('Copy'), 2000);
        });
    };

    return (
        <div className="bg-gray-800 rounded-lg overflow-hidden mt-4 relative">
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 bg-gray-600 text-white text-xs font-semibold py-1 px-3 rounded-md hover:bg-gray-500 transition-colors"
            >
                {copyStatus}
            </button>
            <pre className="p-4 text-sm text-white overflow-x-auto">
                <code>{appsScriptCode}</code>
            </pre>
        </div>
    );
};

export default CodeBlock;
