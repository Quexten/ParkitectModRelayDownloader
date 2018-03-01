var fs = require('fs')
var zipFolder = require('zip-folder');
var rimraf = require('rimraf');

const SteamCmd = require('steamcmd-interface')

var express    = require('express');
var app        = express();
var bodyParser = require('body-parser');

var username = process.env.STEAM_USER
var password = process.env.STEAM_PASSWORD
var port = 80;
var filesEndpoint = process.env.FILES_ENDPOINT

const steamcmd = new SteamCmd({
	username: username,
	password: password
})
steamcmd.prep()

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var router = express.Router();

router.get('/', function(req, res) {
	if (req.baseUrl == "/download") {
		var item_id = req.query.item_id
		console.log("download:" + item_id)

		const commands = [
			steamcmd.getLoginStr(),
			'workshop_download_item 453090 ' + item_id
		]
		const runObj = steamcmd.run(commands)
		runObj.outputStream.on('data', data => { console.log(data) })
		runObj.outputStream.on('error', err => { console.error(err) })
		runObj.outputStream.on('close', exitCode => {
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
		})
	}
});

app.use('/download', router);
app.listen(port);


function workshopPath () {
	return "/root/Steam/steamapps/workshop/"
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
