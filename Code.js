// Main server-side code with invitation system
var SPREADSHEET_TITLE_PREFIX = 'Collaborative Attendance Sheet';
var ACCESS_CODE_PROPERTY = 'ATTENDANCE_SHEET_ACCESS_CODE';
var INVITED_STUDENTS_PROPERTY = 'INVITED_STUDENTS';
var SUBMISSIONS_PROPERTY = 'STUDENT_SUBMISSIONS';
var ADMIN_EMAIL = Session.getActiveUser().getEmail(); // Current user is admin

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Collaborative Attendance Sheet Generator')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function checkSession() {
  const userEmail = Session.getActiveUser().getEmail();
  const accessCode = getAccessCode();
  const invitedStudents = getInvitedStudents();
  
  // Check if current user is admin
  if (userEmail === ADMIN_EMAIL) {
    return {
      success: true,
      student: { name: 'Admin', email: userEmail },
      isAdmin: true,
      hasSession: true,
      accessCode: accessCode,
      invitedStudents: invitedStudents,
      savedInvites: invitedStudents
    };
  }
  
  // Check if user is invited
  if (invitedStudents.includes(userEmail)) {
    const submissionStatus = getSubmissionStatus();
    
    return {
      success: true,
      student: { name: userEmail.split('@')[0], email: userEmail },
      isAdmin: false,
      hasSession: true,
      invitedStudents: invitedStudents,
      submissionStatus: submissionStatus
    };
  }
  
  return { hasSession: false };
}

function verifyAccess(accessCode) {
  const storedCode = getAccessCode();
  const userEmail = Session.getActiveUser().getEmail();
  const invitedStudents = getInvitedStudents();
  
  // Check if user is admin
  if (userEmail === ADMIN_EMAIL) {
    return {
      success: true,
      student: { name: 'Admin', email: userEmail },
      isAdmin: true,
      accessCode: storedCode,
      invitedStudents: invitedStudents,
      savedInvites: invitedStudents,
      submissionStatus: getSubmissionStatus()
    };
  }
  
  // Verify access code
  if (accessCode !== storedCode) {
    return { success: false, message: 'Invalid access code' };
  }
  
  // Check if user is invited
  if (!invitedStudents.includes(userEmail)) {
    return { 
      success: false, 
      message: 'You are not on the invited list. Please contact the administrator.' 
    };
  }
  
  const submissionStatus = getSubmissionStatus();
  
  return {
    success: true,
    student: { name: userEmail.split('@')[0], email: userEmail },
    isAdmin: false,
    invitedStudents: invitedStudents,
    submissionStatus: submissionStatus
  };
}

function getAccessCode() {
  const scriptProperties = PropertiesService.getScriptProperties();
  let accessCode = scriptProperties.getProperty(ACCESS_CODE_PROPERTY);
  
  if (!accessCode) {
    // Generate a new 6-digit access code
    accessCode = Math.floor(100000 + Math.random() * 900000).toString();
    scriptProperties.setProperty(ACCESS_CODE_PROPERTY, accessCode);
  }
  
  return accessCode;
}

function getInvitedStudents() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const invitedStudentsJson = scriptProperties.getProperty(INVITED_STUDENTS_PROPERTY);
  
  if (invitedStudentsJson) {
    return JSON.parse(invitedStudentsJson);
  }
  
  return [];
}

function saveInvitedStudents(emails) {
  try {
    // Validate emails
    const validEmails = emails.filter(email => {
      return email && email.includes('@') && email.includes('.');
    });
    
    if (validEmails.length === 0) {
      return { success: false, message: 'No valid email addresses provided' };
    }
    
    // Store invited students
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty(INVITED_STUDENTS_PROPERTY, JSON.stringify(validEmails));
    
    return {
      success: true,
      invitedStudents: validEmails,
      message: 'Invited students saved successfully'
    };
    
  } catch (error) {
    Logger.log('Error saving invited students: ' + error.toString());
    return { success: false, message: 'Failed to save invited students: ' + error.message };
  }
}

function getSubmissionStatus() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const submissionsJson = scriptProperties.getProperty(SUBMISSIONS_PROPERTY);
  
  if (submissionsJson) {
    return JSON.parse(submissionsJson);
  }
  
  return {};
}

function saveSubmissionStatus(submissions) {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty(SUBMISSIONS_PROPERTY, JSON.stringify(submissions));
}

function submitStudentSchedule(scheduleData) {
  try {
    const userEmail = scheduleData.studentEmail;
    const invitedStudents = getInvitedStudents();
    
    // Check if user is invited
    if (!invitedStudents.includes(userEmail)) {
      return { success: false, message: 'You are not on the invited list' };
    }
    
    // Get current submissions
    const submissions = getSubmissionStatus();
    
    // Save submission
    submissions[userEmail] = scheduleData;
    saveSubmissionStatus(submissions);
    
    // Check if all invited students have submitted
    const allSubmitted = invitedStudents.every(email => email in submissions);
    const pendingCount = invitedStudents.filter(email => !(email in submissions)).length;
    
    let result = {
      success: true,
      submission: scheduleData,
      allStudentsSubmitted: allSubmitted,
      pendingCount: pendingCount,
      message: 'Schedule submitted successfully'
    };
    
    // If all students have submitted, generate PDF automatically
    if (allSubmitted) {
      const pdfResult = generateFinalPDFInternal();
      if (pdfResult.success) {
        result.pdfUrl = pdfResult.pdfUrl;
        result.pdfGenerated = true;
      }
    }
    
    return result;
    
  } catch (error) {
    Logger.log('Error submitting schedule: ' + error.toString());
    return { success: false, message: 'Failed to submit schedule: ' + error.message };
  }
}

function updateStudentSchedule(scheduleData) {
  try {
    const userEmail = scheduleData.studentEmail;
    const invitedStudents = getInvitedStudents();
    
    // Check if user is invited
    if (!invitedStudents.includes(userEmail)) {
      return { success: false, message: 'You are not on the invited list' };
    }
    
    // Get current submissions
    const submissions = getSubmissionStatus();
    
    // Update submission
    submissions[userEmail] = scheduleData;
    saveSubmissionStatus(submissions);
    
    return {
      success: true,
      submission: scheduleData,
      message: 'Schedule updated successfully'
    };
    
  } catch (error) {
    Logger.log('Error updating schedule: ' + error.toString());
    return { success: false, message: 'Failed to update schedule: ' + error.message };
  }
}

function generateFinalPDF() {
  return generateFinalPDFInternal();
}

function generateFinalPDFInternal() {
  try {
    const invitedStudents = getInvitedStudents();
    const submissions = getSubmissionStatus();
    
    // Check if all invited students have submitted
    const allSubmitted = invitedStudents.every(email => email in submissions);
    
    if (!allSubmitted) {
      const pendingStudents = invitedStudents.filter(email => !(email in submissions));
      return { 
        success: false, 
        message: 'Not all students have submitted. Pending: ' + pendingStudents.join(', ') 
      };
    }
    
    // Collect all data
    const quarter = Object.values(submissions)[0].quarter; // Assume same quarter for all
    const weekNumber = Object.values(submissions)[0].weekNumber; // Assume same week
    
    const studentsData = invitedStudents.map(email => {
      const submission = submissions[email];
      return {
        name: submission.studentName || email.split('@')[0],
        email: email,
        classes: submission.classes
      };
    });
    
    // Create spreadsheet
    const spreadsheet = createAttendanceSpreadsheet(studentsData, quarter, weekNumber);
    
    // Generate PDF
    const pdfUrl = createPDF(spreadsheet);
    
    // Send email notifications
    sendEmailNotifications(studentsData, pdfUrl, spreadsheet.getUrl());
    
    return {
      success: true,
      pdfUrl: pdfUrl,
      spreadsheetUrl: spreadsheet.getUrl(),
      message: 'PDF generated and notifications sent to all students'
    };
    
  } catch (error) {
    Logger.log('Error generating PDF: ' + error.toString());
    return { success: false, message: 'Failed to generate PDF: ' + error.message };
  }
}

function createAttendanceSpreadsheet(studentsData, quarter, weekNumber) {
  const spreadsheetName = `${SPREADSHEET_TITLE_PREFIX} - Week ${weekNumber} - ${quarter}`;
  const spreadsheet = SpreadsheetApp.create(spreadsheetName);
  
  // Create main schedule sheet
  const sheet = spreadsheet.getActiveSheet();
  sheet.setName('Week ' + weekNumber);
  
  // Set column widths
  sheet.setColumnWidth(1, 80); // Time column
  
  // Calculate total columns needed (2 per student + 1 for time)
  const totalColumns = studentsData.length * 2;
  
  // Set day columns width
  for (let i = 2; i <= totalColumns + 1; i++) {
    sheet.setColumnWidth(i, 150);
  }
  
  // Add headers
  const weekTitle = 'WEEK ' + weekNumber;
  if (weekNumber === '11') weekTitle += ' (FINALS WEEK)';
  
  sheet.getRange(1, 1).setValue(weekTitle)
    .setFontSize(16)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  sheet.getRange(1, 1, 1, totalColumns + 1).merge()
    .setBackground('#4a6fa5')
    .setFontColor('white');
  
  sheet.getRange(2, 1).setValue('Quarter: ' + quarter)
    .setFontSize(12)
    .setFontWeight('bold');
  sheet.getRange(2, 1, 1, totalColumns + 1).merge();
  
  sheet.getRange(3, 1).setValue('Generated: ' + new Date().toLocaleDateString())
    .setFontSize(11)
    .setFontColor('#666666');
  sheet.getRange(3, 1, 1, totalColumns + 1).merge();
  
  // Add student headers
  let row = 5;
  sheet.getRange(row, 1).setValue('Time');
  
  let col = 2;
  studentsData.forEach(function(student) {
    sheet.getRange(row, col).setValue(student.name)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setBackground('#e3f2fd');
    sheet.getRange(row, col, 1, 2).merge();
    col += 2;
  });
  
  // Add subheaders
  row++;
  sheet.getRange(row, 1).setValue('')
    .setBackground('#f0f7ff');
  
  col = 2;
  studentsData.forEach(function() {
    sheet.getRange(row, col).setValue('Time')
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setBackground('#f0f7ff');
    sheet.getRange(row, col + 1).setValue('Class - Type')
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setBackground('#f0f7ff');
    col += 2;
  });
  
  // Create time slots (8:00 AM to 8:00 PM, every 30 minutes)
  const timeSlots = [];
  for (let hour = 8; hour <= 20; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      timeSlots.push({
        hour: hour,
        minute: minute,
        display: formatTime(hour, minute)
      });
    }
  }
  
  // Fill time slots
  row++;
  for (let i = 0; i < timeSlots.length; i++) {
    const timeSlot = timeSlots[i];
    sheet.getRange(row + i, 1).setValue(timeSlot.display)
      .setFontSize(10)
      .setHorizontalAlignment('right')
      .setVerticalAlignment('middle')
      .setBackground('#f8f9fa');
    
    // For each student, check if they have a class at this time
    col = 2;
    studentsData.forEach(function(student) {
      const classAtTime = findClassAtTime(student.classes, timeSlot.hour, timeSlot.minute);
      
      if (classAtTime) {
        sheet.getRange(row + i, col).setValue(classAtTime.startTime)
          .setFontSize(9)
          .setHorizontalAlignment('center')
          .setVerticalAlignment('middle');
        
        sheet.getRange(row + i, col + 1).setValue(classAtTime.name + ' - ' + classAtTime.type)
          .setFontSize(9)
          .setFontWeight('bold')
          .setHorizontalAlignment('center')
          .setVerticalAlignment('middle')
          .setBackground(getClassColor(classAtTime.type))
          .setWrap(true);
        
        // Merge cells based on duration
        const rowsToMerge = Math.max(1, Math.ceil(classAtTime.duration / 30));
        if (rowsToMerge > 1) {
          sheet.getRange(row + i, col + 1, rowsToMerge, 1).merge();
        }
      } else {
        sheet.getRange(row + i, col).setValue('')
          .setBackground('#ffffff');
        sheet.getRange(row + i, col + 1).setValue('')
          .setBackground('#ffffff');
      }
      
      col += 2;
    });
  }
  
  // Add borders
  const lastRow = row + timeSlots.length - 1;
  const lastCol = 1 + (studentsData.length * 2);
  const gridRange = sheet.getRange(5, 1, lastRow - 4, lastCol);
  gridRange.setBorder(true, true, true, true, null, null, 'black', SpreadsheetApp.BorderStyle.SOLID);
  
  // Add student separators
  for (let s = 0; s < studentsData.length; s++) {
    const studentCol = 2 + (s * 2);
    sheet.getRange(5, studentCol, lastRow - 4, 2)
      .setBorder(null, true, null, true, null, null, '#3498db', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }
  
  // Create summary sheet
  const summarySheet = spreadsheet.insertSheet('Summary');
  setupSummarySheet(summarySheet, studentsData, quarter, weekNumber);
  
  // Format for printing
  formatForPrinting(spreadsheet);
  
  return spreadsheet;
}

function findClassAtTime(classes, hour, minute) {
  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    
    // Check if class starts at this time
    const startHour = parseInt(cls.startTime.split(':')[0]);
    const startMinute = parseInt(cls.startTime.split(':')[1].split(' ')[0]);
    
    if (startHour === hour && startMinute === minute) {
      return cls;
    }
  }
  return null;
}

function formatTime(hour, minute) {
  const period = hour >= 12 ? 'PM' : 'AM';
  let displayHour = hour > 12 ? hour - 12 : hour;
  if (displayHour === 0) displayHour = 12;
  
  return displayHour + ':' + minute.toString().padStart(2, '0') + ' ' + period;
}

function getClassColor(classType) {
  const colors = {
    'LE': '#d4edda', // Lecture - Green
    'DI': '#d1ecf1', // Discussion - Blue
    'LA': '#fff3cd', // Lab - Yellow
    'SI': '#f8d7da'  // SI Session - Red
  };
  return colors[classType] || '#e2e3e5';
}

function setupSummarySheet(sheet, studentsData, quarter, weekNumber) {
  sheet.clear();
  
  // Add title
  sheet.getRange(1, 1).setValue('Attendance Sheet Summary')
    .setFontSize(16)
    .setFontWeight('bold');
  sheet.getRange(1, 1, 1, 4).merge();
  
  sheet.getRange(2, 1).setValue('Quarter: ' + quarter)
    .setFontSize(12);
  sheet.getRange(2, 1, 1, 4).merge();
  
  sheet.getRange(3, 1).setValue('Week: ' + weekNumber)
    .setFontSize(12);
  sheet.getRange(3, 1, 1, 4).merge();
  
  sheet.getRange(4, 1).setValue('Generated: ' + new Date().toLocaleDateString())
    .setFontSize(11)
    .setFontColor('#666666');
  sheet.getRange(4, 1, 1, 4).merge();
  
  // Add student list
  let row = 6;
  sheet.getRange(row, 1).setValue('Students:')
    .setFontWeight('bold');
  
  row++;
  studentsData.forEach((student, index) => {
    sheet.getRange(row + index, 1).setValue(index + 1 + '. ' + student.name);
    sheet.getRange(row + index, 2).setValue(student.email);
  });
  
  row += studentsData.length + 2;
  
  // Add instructions
  sheet.getRange(row, 1).setValue('Instructions:')
    .setFontWeight('bold');
  sheet.getRange(row, 1, 1, 4).merge();
  
  const instructions = [
    '1. This attendance sheet is for Week ' + weekNumber,
    '2. Each student\'s schedule is shown in separate columns',
    '3. Mark attendance using: P=Present, A=Absent, L=Late, E=Excused',
    '4. Color coding: Green=Lecture, Blue=Discussion, Yellow=Lab, Red=SI',
    '5. Print in landscape orientation for best results'
  ];
  
  instructions.forEach((instruction, index) => {
    sheet.getRange(row + 1 + index, 1).setValue(instruction);
    sheet.getRange(row + 1 + index, 1, 1, 4).merge();
  });
  
  // Set column widths
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 300);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 150);
}

function formatForPrinting(spreadsheet) {
  const sheets = spreadsheet.getSheets();
  
  sheets.forEach(function(sheet) {
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    
    if (lastRow > 0 && lastCol > 0) {
      sheet.setPrintArea(1, 1, lastRow, lastCol);
      
      const printSetup = sheet.getSheetPageSetup();
      printSetup.setOrientation(SpreadsheetApp.PrintOrientation.LANDSCAPE);
      printSetup.setFitToWidth(1);
      printSetup.setFitToHeight(0);
      printSetup.setMargins(0.25, 0.25, 0.25, 0.25);
      
      sheet.setGridlines(false);
    }
  });
}

function createPDF(spreadsheet) {
  try {
    const sheet = spreadsheet.getSheets()[0]; // Main sheet
    const sheetId = sheet.getSheetId();
    
    // Create export URL
    const url = 'https://docs.google.com/spreadsheets/d/' + spreadsheet.getId() + 
                '/export?format=pdf&' +
                'gid=' + sheetId + '&' +
                'portrait=false&' +
                'fitw=true&' +
                'gridlines=false&' +
                'printtitle=false&' +
                'sheetnames=false&' +
                'pagenum=CENTER&' +
                'horizontal_alignment=CENTER&' +
                'vertical_alignment=TOP&' +
                'top_margin=0.25&' +
                'bottom_margin=0.25&' +
                'left_margin=0.25&' +
                'right_margin=0.25&' +
                'scale=4&' +
                'size=A4&' +
                'fzr=false';
    
    // Generate PDF blob
    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });
    
    const pdfBlob = response.getBlob();
    pdfBlob.setName(spreadsheet.getName() + '.pdf');
    
    // Save to Drive
    const folder = createPDFFolder();
    const file = folder.createFile(pdfBlob);
    
    return file.getUrl();
    
  } catch (error) {
    Logger.log('Error creating PDF: ' + error.toString());
    throw error;
  }
}

function createPDFFolder() {
  const folderName = 'Attendance Sheet PDFs';
  const folders = DriveApp.getFoldersByName(folderName);
  
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return DriveApp.createFolder(folderName);
  }
}

function sendEmailNotifications(studentsData, pdfUrl, spreadsheetUrl) {
  const subject = 'Attendance Sheet Generated - Week ' + studentsData[0].weekNumber;
  
  studentsData.forEach(student => {
    const body = `
Hello ${student.name},

The collaborative attendance sheet has been generated successfully!

All students have submitted their schedules for Week ${studentsData[0].weekNumber}.

📄 PDF Download: ${pdfUrl}
📊 Spreadsheet: ${spreadsheetUrl}

Instructions:
1. Download the PDF for printing
2. Mark attendance using: P=Present, A=Absent, L=Late, E=Excused
3. Print in landscape orientation for best results

Thank you for participating!

Best regards,
Attendance Sheet System
    `;
    
    try {
      MailApp.sendEmail({
        to: student.email,
        subject: subject,
        body: body
      });
    } catch (error) {
      Logger.log('Error sending email to ' + student.email + ': ' + error.toString());
    }
  });
  
  // Also send to admin
  const adminBody = `
All students have submitted their schedules for Week ${studentsData[0].weekNumber}.

PDF generated: ${pdfUrl}
Spreadsheet: ${spreadsheetUrl}

Submitted students:
${studentsData.map(s => `• ${s.name} (${s.email})`).join('\n')}
  `;
  
  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    subject: '[Admin] Attendance Sheet Generated',
    body: adminBody
  });
}

function resetAllSubmissions() {
  try {
    // Clear all submissions
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.deleteProperty(SUBMISSIONS_PROPERTY);
    
    return {
      success: true,
      message: 'All submissions have been reset. Students can submit again.'
    };
    
  } catch (error) {
    Logger.log('Error resetting submissions: ' + error.toString());
    return { success: false, message: 'Failed to reset submissions: ' + error.message };
  }
}

// Test function
function testInvitationSystem() {
  // Set test invited students
  const testEmails = [
    'student1@example.com',
    'student2@example.com',
    'student3@example.com'
  ];
  
  saveInvitedStudents(testEmails);
  
  // Simulate submissions
  const submissions = {};
  
  testEmails.forEach((email, index) => {
    submissions[email] = {
      studentName: 'Student ' + (index + 1),
      studentEmail: email,
      quarter: 'Winter 2026',
      weekNumber: '2',
      classes: [
        {
          name: 'CLASS ' + (index + 1),
          type: index % 2 === 0 ? 'LE' : 'DI',
          days: ['M', 'W', 'F'],
          startTime: '8:00 am',
          endTime: '8:50 am',
          duration: 50
        }
      ],
      submissionTime: new Date().toISOString()
    };
  });
  
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty(SUBMISSIONS_PROPERTY, JSON.stringify(submissions));
  
  Logger.log('Test data setup complete');
  Logger.log('Access code: ' + getAccessCode());
  Logger.log('Invited students: ' + JSON.stringify(getInvitedStudents()));
  Logger.log('Submission count: ' + Object.keys(getSubmissionStatus()).length);
  
  return {
    accessCode: getAccessCode(),
    invitedStudents: getInvitedStudents(),
    submissions: getSubmissionStatus()
  };
}
