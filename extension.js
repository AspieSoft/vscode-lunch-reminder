const vscode = require('vscode');
const fs = require('fs');
const {join} = require('path');

const lastReminderPath = join(__dirname, 'last-reminder.txt');

let interval = undefined;

function activate(context){

	const config = vscode.workspace.getConfiguration('lunchReminder');

	let startTime = (config.get('startTime') || '11:30').split(':');
	let endTime = (config.get('endTime') || '13:30').split(':');

	let strictTime = (config.get('strictTime') || '12:30').split(':');
	let strictMinPrompts = Number(config.get('strictMinPrompts')) || 0;
	let loosePrompts = Number(config.get('loosePrompts')) || 0;

	let reminderDelay = Number(config.get('reminderDelay')) || 10;
	let lockoutTime = Number(config.get('lockoutTime')) || 10;
	let stopIdleTime = Number(config.get('stopIdleTime')) || 8;

	let forceStopCMD = config.get('forceStopCommand') || null;

	vscode.workspace.onDidChangeConfiguration(event => {
		const config = vscode.workspace.getConfiguration('lunchReminder');

		startTime = (config.get('startTime') || '11:30').split(':');
		endTime = (config.get('endTime') || '13:30').split(':');

		strictTime = (config.get('strictTime') || '12:30').split(':');
		strictMinPrompts = Number(config.get('strictMinPrompts')) || 0;
		loosePrompts = Number(config.get('loosePrompts')) || 0;

		reminderDelay = Number(config.get('reminderDelay')) || 10;
		lockoutTime = Number(config.get('lockoutTime')) || 10;
		stopIdleTime = Number(config.get('stopIdleTime')) || 8;

		forceStopCMD = config.get('forceStopCommand') || null;
	});


	let lastReminder = new Date().getTime();
	let prompts = 0;
	let inWait = 0;
	let showingBox = false;
	let lastAction = new Date().getTime();

	function updateTime(){
		fs.writeFileSync(lastReminderPath, [lastReminder.toString(), prompts.toString(), inWait.toString()].join('\n'));
	}

	let now = (new Date().getTime());

	if(!fs.existsSync(lastReminderPath)){
		updateTime();
	}else{
		let data = fs.readFileSync(lastReminderPath).toString().split('\n');
		lastReminder = Number(data[0]) || now;
		prompts = Number(data[1]) || 0;
		inWait = Number(data[2]) || 0;
	}

	if(now - (60000*720) > lastReminder){
		lastReminder = now;
		prompts = 0;
		inWait = 0;
		updateTime();
	}

	function doneReminder(){
		lastReminder = (new Date().getTime()) + (60000*720); // 12 hours
		prompts = 0;
		inWait = 0;
		updateTime();
	}

	function showReminder(allowDone){
		let placeHolder = 'Enter OK';
		if(allowDone){
			placeHolder += ' or DONE';
		}
		vscode.window.showInputBox({prompt: 'Don\'t Forget To Eat Lunch!', placeHolder}).then(value => {
			if(!value || value === ''){
				showReminder(allowDone);
				return;
			}

			if(allowDone && value.toString().toLowerCase() === 'done'){
				doneReminder();
        alertOnce('stopped', 'Stopped Lunch Reminder!');
				showingBox = false;
				return;
			}

			if(value.toString().toLowerCase() === 'ok'){
        alertOnce('reminder', 'Remember to spend at least 5 minutes eating lunch');
				showingBox = false;
				return;
			}

			if(forceStopCMD && value.toString().toLowerCase() === forceStopCMD){
				doneReminder();
        alertOnce('stopped', 'Force Stopped Lunch Reminder!');
				showingBox = false;
				return;
			}

			showReminder(allowDone);
		});
	}

	function forceWait(initTime){
		if(initTime){
			inWait = initTime;
		}

		updateTime();

		let now = new Date().getTime();
		if(now < inWait + (60000*lockoutTime)){

			let seconds = (60*lockoutTime) - Math.round((now - inWait) / 1000);
			let minutes = 0;
			while(seconds >= 60){
				seconds -= 60;
				minutes++;
			}
			let timeMsg = '';
			if(seconds === 0){
				timeMsg = `${minutes} minute${(minutes !== 1) ? 's' : ''}`;
			}else if(minutes === 0){
				timeMsg = `${seconds} second${(seconds !== 1) ? 's' : ''}`;
			}else{
				timeMsg = `${minutes} minute${(minutes !== 1) ? 's' : ''} and ${seconds} second${(seconds !== 1) ? 's' : ''}`;
			}

			vscode.window.showInputBox({prompt: `You must wait ${timeMsg} Before you continue programing!\nMight as well eat lunch while your waiting...`, placeHolder: `Press ENTER or ESCAPE in ${lockoutTime} minute${(lockoutTime !== 1) ? 's' : ''}`}).then(value => {
				if(!value || value === ''){
					forceWait();
					return;
				}

				if(forceStopCMD && value.toString().toLowerCase() === forceStopCMD){
					doneReminder();
          alertOnce('stopped', 'Force Stopped Lunch Reminder!');
					showingBox = false;
					return;
				}

				forceWait();
			});

			return;
		}

		doneReminder();
    alertOnce('stopped', 'Stopped Lunch Reminder!');
		showingBox = false;
	}

	interval = setInterval(() => {
		if(showingBox){return;}
		let now = new Date().getTime();
		if(now > lastAction + (60000*stopIdleTime)){
			doneReminder();
      alertOnce('stopped', 'Auto Stopped Lunch Reminder!');
			return;
		}
		let hour = new Date().getHours();
		let minute = new Date().getMinutes();
		if(now > lastReminder + (60000*reminderDelay) && ((hour === startTime[0] && minute > startTime[1]) || (hour === endTime[0] && minute <= endTime[1]) || hour > startTime[0] && hour < endTime[0])){
			showingBox = true;
			lastReminder = now;
			prompts++;
			updateTime();
			if(prompts > strictMinPrompts && ((hour === strictTime[0] && minute >= strictTime[1]) || hour > strictTime[0])){
				forceWait(now);
				return;
			}
			showReminder(prompts <= loosePrompts);
		}
	}, 1000);

	if(inWait !== 0){
		forceWait();
	}

	function onDidSomething(){
		lastAction = new Date().getTime();
	}

	vscode.workspace.onDidChangeTextDocument(onDidSomething);
	vscode.workspace.onDidCreateFiles(onDidSomething);
	vscode.workspace.onDidDeleteFiles(onDidSomething);
	vscode.workspace.onDidRenameFiles(onDidSomething);
	vscode.workspace.onDidOpenTextDocument(onDidSomething);
	vscode.workspace.onDidCloseTextDocument(onDidSomething);
	vscode.workspace.onDidSaveTextDocument(onDidSomething);
	vscode.workspace.onDidChangeConfiguration(onDidSomething);
}

function deactivate(){
	if(interval){
		clearInterval(interval);
		interval = undefined;
	}
}

const alerts = {};
function alertOnce(type, msg){
  if(alerts[type]){
    return;
  }
  alerts[type] = new Date().getTime();
  vscode.window.showInformationMessage(msg);
}

setInterval(() => {
  const now = new Date().getTime();
  const expire = 1000 * 60 * 120; // 2 hours
  const types = Object.keys(alerts);
  for(let i = 0; i < types.length; i++){
    if(now - alerts[types[i]] > expire){
      delete alerts[types[i]];
    }
  }
}, 10000);

module.exports = {
	activate,
	deactivate
}
