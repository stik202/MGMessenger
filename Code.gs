// --- КОНФИГУРАЦИЯ ---
const DB_ID = '1U7PuK6wSOy813HbvYAC0qrUC7TOFUBco0JJT1TPJvrI'; 
const AUTH_ID = '1jbl4hAB5YsaRTBwYhkrIivXcF0Erf0eaAICLe7viUX4'; 
const DRIVE_FOLDER_ID = '1SrFSO_uMjy0vxc1_i_Xjir7pJKNwYYfO'; 

const AUTH_COL_LOGIN = 1; 
const AUTH_COL_PASS = 3; 

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('MG Messenger')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function loginUser(login, password) {
  const sheet = SpreadsheetApp.openById(AUTH_ID).getSheets()[0];
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][AUTH_COL_LOGIN]) === login && String(data[i][AUTH_COL_PASS]) === password) {
      return { status: 'success', profile: getOrCreateProfile(login) };
    }
  }
  return { status: 'error', message: 'Неверный логин или пароль' };
}

function getOrCreateProfile(login) {
  const sheet = SpreadsheetApp.openById(DB_ID).getSheetByName('Profiles');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(login)) {
      return {
        login: String(data[i][0]), avatar: String(data[i][1]), phone: String(data[i][2]),
        email: String(data[i][3]), position: String(data[i][4]), role: String(data[i][5]),
        lastName: String(data[i][6]), firstName: String(data[i][7]), middleName: String(data[i][8]),
        name: data[i][7] ? `${data[i][7]} ${data[i][6]}` : String(data[i][0])
      };
    }
  }
  const newRow = [login, '', '', '', '', 'User', '', '', ''];
  sheet.appendRow(newRow);
  return { login: login, role: 'User', name: login };
}

// Функция смены пароля
function changePassword(login, newPass) {
  const sheet = SpreadsheetApp.openById(AUTH_ID).getSheets()[0];
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][AUTH_COL_LOGIN]) === login) {
      sheet.getRange(i + 1, AUTH_COL_PASS + 1).setValue(String(newPass));
      return { status: 'success' };
    }
  }
  return { status: 'error' };
}

function updateMyProfile(login, data) {
  const sheet = SpreadsheetApp.openById(DB_ID).getSheetByName('Profiles');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === login) {
      sheet.getRange(i + 1, 2, 1, 8).setValues([[
        data.avatarUrl, data.phone, data.email, data.position, values[i][5], 
        data.lastName, data.firstName, data.middleName
      ]]);
      return { status: 'success' };
    }
  }
}

function uploadFileToDrive(base64Data, fileName, mimeType) {
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const bytes = Utilities.base64Decode(base64Data.split(',')[1]);
  const file = folder.createFile(Utilities.newBlob(bytes, mimeType, fileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://lh3.googleusercontent.com/d/" + file.getId();
}

function sendMessage(senderLogin, senderName, receiver, type, content, fileData) {
  const sheet = SpreadsheetApp.openById(DB_ID).getSheetByName('Messages');
  let fileUrl = fileData ? uploadFileToDrive(fileData.data, fileData.name, fileData.mimeType) : '';
  sheet.appendRow([Utilities.getUuid(), new Date(), senderLogin, senderName, receiver, type, content, fileData ? fileData.mimeType : '', fileUrl]);
  return { status: 'success' };
}

function getMessages(userLogin, chatPartner) {
  const sheet = SpreadsheetApp.openById(DB_ID).getSheetByName('Messages');
  const data = sheet.getDataRange().getValues();
  return data.slice(1).filter(row => 
    (row[5] === 'private' && ((row[2] === userLogin && row[4] === chatPartner) || (row[2] === chatPartner && row[4] === userLogin))) ||
    (row[5] === 'group' && row[4] === chatPartner)
  ).map(row => ({
    sender: row[3], text: row[6], fileUrl: row[8], isImage: String(row[7]).includes('image'),
    isMine: row[2] === userLogin, time: Utilities.formatDate(new Date(row[1]), "GMT+3", "HH:mm")
  }));
}

function getActiveChats(userLogin) {
  const msgData = SpreadsheetApp.openById(DB_ID).getSheetByName('Messages').getDataRange().getValues();
  const activeLogins = new Set();
  msgData.forEach(r => {
    if (String(r[2]) === userLogin) activeLogins.add(String(r[4]));
    if (String(r[4]) === userLogin) activeLogins.add(String(r[2]));
  });
  
  const profiles = SpreadsheetApp.openById(DB_ID).getSheetByName('Profiles').getDataRange().getValues();
  const users = profiles.slice(1)
    .filter(r => activeLogins.has(String(r[0])))
    .map(r => ({ 
      login: String(r[0]), name: `${r[7]} ${r[6]}`, avatar: String(r[1]),
      phone: String(r[2]), email: String(r[3]), position: String(r[4]), isGroup: false
    }));
    
  const groups = SpreadsheetApp.openById(DB_ID).getSheetByName('Groups').getDataRange().getValues()
    .slice(1)
    .filter(r => String(r[3]).split(',').includes(userLogin))
    .map(r => ({ login: String(r[0]), name: String(r[1]), avatar: String(r[2]), members: String(r[3]), owner: String(r[4]), isGroup: true }));

  return { users: users, groups: groups };
}

function getAllUsers() {
  return SpreadsheetApp.openById(DB_ID).getSheetByName('Profiles').getDataRange().getValues()
    .slice(1).map(r => ({ 
      login: r[0], name: `${r[7]} ${r[6]}`, avatar: r[1],
      phone: r[2], email: r[3], position: r[4],
      searchString: `${r[7]} ${r[6]} ${r[8]} ${r[2]} ${r[3]}`.toLowerCase()
    }));
}

function saveGroupSettings(groupId, data) {
  const sheet = SpreadsheetApp.openById(DB_ID).getSheetByName('Groups');
  const rows = sheet.getDataRange().getValues();
  for(let i=1; i<rows.length; i++) {
    if(rows[i][0] === groupId) {
      sheet.getRange(i+1, 2, 1, 3).setValues([[data.name, data.avatar, data.members]]);
      return {status: 'success'};
    }
  }
}

function createGroup(name, members, owner) {
  const sheet = SpreadsheetApp.openById(DB_ID).getSheetByName('Groups');
  // Убеждаемся, что владелец есть в списке участников
  if (!members.includes(owner)) {
    members.push(owner);
  }
  sheet.appendRow([Utilities.getUuid(), name, '', members.join(','), owner]);
  return { status: 'success' };
}