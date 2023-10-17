// gs doesn't has global var. we use Cache instead.
// Column A: group number, B: stdID, F: email(@ku)


// *-----------------------------------Utility function----------------------------------------------*

// change 1 to '01'
function to_2digit(num){
  if(typeof(num)=='string') {
    if(num.length>1) return num;
    num = parseInt(num);
  }
  if(num<10) return '0'+num;
  else return num.toString();
}

// finder string in array
Array.prototype.finder = function(para){
  if(para==='') return false;
  const arr = [];
  for(let i=0;i<this.length;i++){
    if(this[i].toString().indexOf(para) > -1) arr.push(i);
  }
  return arr;
}

// *-----------------------------------Set up script----------------------------------------------*

function trigger_manually(){
  //delete all triggers and create new ones
  const allTriggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < allTriggers.length; i++){
    if(allTriggers[i].getUniqueId)
    ScriptApp.deleteTrigger(allTriggers[i]);
  }

  var sheet = SpreadsheetApp.getActive();
  ScriptApp.newTrigger("update_result").forSpreadsheet(sheet).onFormSubmit().create();
}

function select_sheet_ui(arr){
  var ui = SpreadsheetApp.getUi();
  var cache = CacheService.getScriptCache();
  cache.remove("what_sheet")

  // var tmp_txt = 'Sheets: ';
  //   for(let i=0;i<arr.length;i++){
  //     if(i) tmp_txt+= ' / ';
  //     tmp_txt+= arr[i].getName();
  //   }

  var html = HtmlService.createTemplateFromFile('select_sheet');
  html.data = arr;
  ui.showModalDialog(html.evaluate().setHeight(200), 'Which sheet?');
  var cached;

  while(1){
    cached = cache.get("what_sheet");
    if (cached != null) {
      return cached;
    }
  }
}

function click_select(txt){
  var cache = CacheService.getScriptCache();
  console.log(txt);
  if(txt!==''){
    cache.put("what_sheet", txt, 14400);
  }
}

function start() { 
  var name_sheet;
  var sheetURL_stdName;
  var sheet_name;
  var ui = SpreadsheetApp.getUi();
  var cache = CacheService.getScriptCache();

  const current_sheet = SpreadsheetApp.getActiveSheet();
  const last_col = current_sheet.getLastColumn();
  const c_name = current_sheet.getName();
  const c_spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  try {
    //select spreadsheet
    var response = ui.prompt('Link to students name&group?', 'Link plz', ui.ButtonSet.YES_NO);
    if (response.getSelectedButton() == ui.Button.YES) sheetURL_stdName = response.getResponseText();
    else throw "u click no :(";

    var is_voted = false;
    trigger_manually();

    Logger.log(sheetURL_stdName);
    name_sheet = SpreadsheetApp.openByUrl(sheetURL_stdName);
    ui.alert("Get name from: "+name_sheet.getName());

    //select sheet
    sheet_name = select_sheet_ui(name_sheet.getSheets().map((m)=>m.getName()));

    //test correction
    name_sheet = name_sheet.getSheetByName(sheet_name);
    // Logger.log(name_sheet.getRange(1, 2, 10).getValues().toString());

    const _id = name_sheet.getRange(1, 2, name_sheet.getLastRow()).getValues().map((m)=>(m.toString()));
    const _email = name_sheet.getRange(1, 6, name_sheet.getLastRow()).getValues().map((m)=>(m.toString()));
    const _gNumber = name_sheet.getRange(1, 1, name_sheet.getLastRow()).getValues().map((m)=>(to_2digit(m)));

    // Logger.log(_id);
    // Logger.log(_email);
    // Logger.log(_gNumber);
    if(_gNumber[0]!=1) throw "Selected sheet isn't in the correct format";
    const last = parseInt(_gNumber[_gNumber.length-1]);
    
    // caches for presented groups
    for(let i=1;i<last+1;i++) cache.put('G'+to_2digit(i), 'F', 14400);
    cache.remove('presented'); //clear possible remain cache

    // create voted sheet for stores the voted group
    var voted;
    var tmp = [''];
    for(let i=1;i<last+1;i++) tmp.push("'"+to_2digit(i));
    if((voted = c_spreadsheet.getSheetByName('_voted')) === null){
      voted = c_spreadsheet.insertSheet('_voted'); // stores the voting activity
      voted.appendRow(tmp);
      is_voted = true;
    }

    // put std info in cache and create a row in voted sheet
    // key: email  value: ID+'/'+group number(01~20)
    _email.forEach((v, i)=>{
      cache.put(v, _id[i]+'/'+_gNumber[i], 14400); // cache for 4 hours
      if(is_voted) voted.appendRow([v]);
    })

    //return to original sheet
    c_spreadsheet.getSheetByName(c_name).activate();

    //check
    // var values = cache.getAll(_email);
    // Logger.log(values);

    // check if this sheet has a column that stores error info, if not, create new.
    if(current_sheet.getRange(1, last_col).getValue()!=='Error type') current_sheet.getRange(1, last_col+1).setValue('Error type');

    ui.alert("Processing is finished! Ready for another step.");
  } catch (err) {
    ui.alert('Error: ' + err);
  }
}

// *-----------------------------------Run on open spreadsheet---------------------------------*

function onOpen(){
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('PopularVote').addItem('Start Script', 'start').addSeparator()
                          .addItem('Add Group', 'addG').addSeparator()
                          .addItem('Announce winner', 'result')
                          .addToUi();
}

// *----------------------------------function for check responses on submit---------------------*

function checkNameAndID(em, id, gn){
  var cache = CacheService.getScriptCache();
  if(tmp = cache.get(em)){
    const [_id, _gn] = tmp.split('/'); 
    if(id!==_id || gn!==_gn) return false;
  } else return false;
  
  return true;
}

function checkPresentedG(to_gn){
  var cache = CacheService.getScriptCache();
  // console.log(cache.get('G'+to_gn));
  return cache.get('G'+to_gn); // if already presented = return true
}

// return true if already submitted
function checkSubmittedG(em, to_gn){
  const voted_sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_voted');
  const _row = voted_sheet.createTextFinder(em).findNext().getRow();
  const _cell = voted_sheet.getRange(_row, parseInt(to_gn)+1);
  if(_cell.getValue()==1) return true;
  else _cell.setValue(1);
  return false;
}

// *----------------------------------trigger on submitted-----------------------------------------*

function update_result(e){
  const response = e.values;
  const sheet = SpreadsheetApp.getActiveSheet();
  const last_col = sheet.getLastColumn();
  const _cell = sheet.getRange(e.range.getRow(), last_col); //cell that stores the error info

  const em = response[12];
  const id = response[1].toString();
  const gn = response[2];
  const to_gn = response[3];

  // // for debugging
  // try{
  //   if(checkNameAndID(em, id, gn)){
  //     throw 'Correct identity';
  //   } else throw 'Fraud identity';
  // } catch (err) {
  //   ui.alert('Error: ' + err);
  // }

  //actual code
  if(!checkNameAndID(em, id, gn)) _cell.setValue('Fraud identity');
  else if(checkPresentedG(to_gn)==='F' || to_gn==gn) _cell.setValue('Unfaithful submit'); //the group hasn't present yet
  else if(checkSubmittedG(em, to_gn)) _cell.setValue('Already summited the score'); //  check if this group already got voted by this user
}

// *----------------------------------call to add presented group-----------------------------------------*

function addG(){
  const ui = SpreadsheetApp.getUi();
  var cache = CacheService.getScriptCache();
  var tmp;
  const txt = cache.get('presented'); 

  var response = ui.prompt('Add presented group?', 'the group that already presented:\n'+txt, ui.ButtonSet.YES_NO);
  if (response.getSelectedButton() == ui.Button.YES) tmp = response.getResponseText();
  else throw 'Adding group failed';

  // tmp = (parseInt(tmp) < 10)? '0'+tmp : tmp;
  tmp = to_2digit(tmp);

  if(cache.get('G'+tmp)==null){ 
    throw 'There\'re no such a group';
  } else if(cache.get('G'+tmp)==='T'){
    throw 'Already add that group';
  }

  cache.put('G'+tmp, 'T', 14400);
  cache.put('presented', txt? txt+' '+tmp : tmp, 14400);
}

// *----------------------------------call to calculate result-----------------------------------------*

// show Result
function result(){
  const sheet = SpreadsheetApp.getActiveSheet();
  const _range = sheet.getDataRange();
  const c_spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  const tmp = (sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues())[0];
  var num_header = tmp.finder('['); // when use in sheet please always +1 cus columnA start at 1 while this array start at 0
  var header = num_header.map((m)=>(tmp[m]));
  
  var htmlOutput = HtmlService
    .createHtmlOutputFromFile('spoiler')
    .setWidth(1400)
    .setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, ' ');

  var result_sheet;
  if((result_sheet = c_spreadsheet.getSheetByName('_result')) === null) result_sheet = c_spreadsheet.insertSheet('_result');
  const pTable = result_sheet.getRange(1,1).createPivotTable(_range);

  sheet.activate();

  // set Values& Calculated function
  pTable.addPivotValue(4, SpreadsheetApp.PivotTableSummarizeFunction.COUNTA).setDisplayName('จำนวนโหวต');
  var cFunction = '=AVERAGE(';
  header.forEach((v, i)=>{
    pTable.addPivotValue(num_header[i]+1, SpreadsheetApp.PivotTableSummarizeFunction.AVERAGE).setDisplayName(v);
    cFunction += 'AVERAGE(' +'\'' + v + '\'), ';
  })
  cFunction = cFunction.slice(0, -2);
  cFunction += ')';
  const total = pTable.addCalculatedPivotValue('คะแนนรวม', cFunction).summarizeBy(SpreadsheetApp.PivotTableSummarizeFunction.CUSTOM);

  //add filter
  const succes_f =  SpreadsheetApp.newFilterCriteria().whenCellEmpty().build();
  pTable.addFilter(sheet.getLastColumn(), succes_f);

  // set Row & sort descending
  pTable.addRowGroup(4).showTotals(false).setDisplayName('กลุ่มที่').sortBy(total, []).sortDescending();

  // call to create pivot for showing frauds vote
  var fraud_sheet;
  if((fraud_sheet = c_spreadsheet.getSheetByName('_frauds')) === null) fraud_sheet = c_spreadsheet.insertSheet('_frauds');
  const fTable = fraud_sheet.getRange(1,1).createPivotTable(_range);

  const test = fTable.addRowGroup(sheet.getLastColumn()).setDisplayName('ประเภทการโหวต');
  fTable.addPivotValue(1, SpreadsheetApp.PivotTableSummarizeFunction.COUNTA).setDisplayName('จำนวน');

  sheet.activate();
  SpreadsheetApp.getUi().alert('Done!');
}

///////////////////////////////WEB APP SECTION////////////////////////////////////////////

function doGet(e) {
  var htmlOutput =  HtmlService.createTemplateFromFile('index');
  htmlOutput.search='';
  return render('index');
}

function doPost(e) {
  var search =e.parameter.search;
  var htmlOutput =  HtmlService.createTemplateFromFile('index');
  htmlOutput.search= search;
  return htmlOutput.evaluate();
}

function getSheetData()  { 
  var ss= SpreadsheetApp.getActiveSpreadsheet();
  var dataSheet1 = ss.getSheetByName('_result').getDataRange().getDisplayValues();
  var dataSheet2 = ss.getSheetByName('_frauds').getDataRange().getDisplayValues();   
  return [dataSheet1, dataSheet2];
}
