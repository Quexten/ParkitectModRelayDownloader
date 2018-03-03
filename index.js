var fs = require('fs')
var zipFolder = require('zip-folder');
var rimraf = require('rimraf');

const SteamCmd = require('steamcmd-interface')

var express    = require('express');
var app        = express();
var bodyParser = require('body-parser');

//var filesEndpoint = process.env.FILES_ENDPOINT
var filesEndpoint = 'http://localhost'

var port = 80

const steamcmd = new SteamCmd()
steamcmd.prep()

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var router = express.Router();

var currentDownload = null
var currentListener = null
var process = null

router.get('/', function(req, res) {
	if (req.baseUrl == "/login") {
		login()
	}

	if (req.baseUrl == "/download") {
		var item_id = req.query.item_id

		queueDownload({ id:item_id, callback: function () {
			var contentPath = getPath() + item_id + '/'
			var files = fs.readdirSync(contentPath)
			var isPath = files.length == 1 && fs.lstatSync(contentPath + files[0]).isDirectory()
			console.log("download-directory" + isPath)

			if (!isPath) {
				var file = getPath() + item_id + '/' + files[0]
				move(file, "/workshop/" + item_id + ".png", function (err) {
					if (err != null) {
						res.json({ error: "Move Failed." })
					} else {
						res.json({ download: filesEndpoint + '/' + item_id + ".png"})
					}
					clearFiles()
				})

				console.log("file downloaded" + file)
			} else {
				var dirPath = getPath() + item_id + '/'
				zipFolder(dirPath, '/workshop/' + item_id + ".zip", function(err) {
				  if(err) {
						res.json({ error: "Zip Failed." })
				  } else {
						res.json({ download: filesEndpoint + '/' + item_id + ".zip"})
				  }
					clearFiles()
				})

				console.log("pack downloaded" + dirPath)
			}
		}})
	}
});

app.use('/download', router);
app.use('/login', router);
app.listen(port);

function login () {
	var spawn = require('child_process').spawn
	process = spawn(steamcmd.exePath,['-i'])

	var STATE_STARTING = 0
	var STATE_LOGGING_IN = 1
	var STATE_LOGGED_IN = 2
	var STATE_DONE = 3
	var state = STATE_STARTING

	process.stdout.on('data',function (data) {
		console.log(data.toString())
		switch (state) {
			case STATE_STARTING:
				if (data.toString().includes("OK")) {
					state = STATE_LOGGING_IN
					process.stdin.write('login anonymous\n')
				}
				break
			case STATE_LOGGING_IN:
				if (data.toString().includes("OK")) {
					state = STATE_LOGGED_IN
				}
				break
			case STATE_LOGGED_IN:
				if (data.toString().includes("OK")) {
					state = STATE_DONE
					console.log("logged in successfully, now listening")
				}
				break
			case STATE_DONE:
				if (currentListener != null) {
					currentListener(data.toString())
				}
				break
		}
	})
}

function queueDownload (request) {
	console.log(JSON.stringify(request))
	if (currentDownload == null) {
		currentDownload = request
		executeDownload(currentDownload)
	} else {
		queueDownloadRecursive(request)
	}
}

function queueDownloadRecursive (download, id, callback) {
	if (download.next == null) {
		download.next = { id:id, callback:callback }
	} else {
		queueDownloadRecursive(download.next, id, callback)
	}
}

function executeDownload (request) {
	console.log("write" + 'workshop_download_item 453090 ' + request.id)
	process.stdin.write('workshop_download_item 453090 ' + request.id + '\n')
	currentListener = function (data) {
		if (data.toString().includes("Success")) {
			request.callback()

			currentDownload = request.next
			if (currentDownload != null)
				executeDownload(currentDownload)
		}
	}
}

function workshopPath () {
	// /root/Steam/steamapps/workshop
	return "./node_modules/steamcmd-interface/steamcmd_bin/win32/steamapps/workshop/"
}

function getPath () {
	return workshopPath() + "content/453090/"
}

function clearFiles () {
	try {
		rimraf(getPath(), function () { console.log('Files Cleaned.') });
		fs.unlinkSync(workshopPath() + "appworkshop_453090.acf")
	} catch(err) {}
}

function move(oldPath, newPath, callback) {
    fs.rename(oldPath, newPath, function (err) {
        if (err) {
            if (err.code === 'EXDEV') {
                copy();
            } else {
                callback(err)
            }
            return;
        }
        callback();
    });

    function copy() {
        var readStream = fs.createReadStream(oldPath);
        var writeStream = fs.createWriteStream(newPath);
        readStream.on('error', callback);
        writeStream.on('error', callback);
        readStream.on('close', function () {
            fs.unlink(oldPath, callback);
        });
        readStream.pipe(writeStream);
    }
}
