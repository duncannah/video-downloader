const fs = require("fs-extra");
const path = require("path");
const express = require("express");

const YTDL = "python3";
const YTDL_ARG = [path.join(__dirname, "../bin/youtube-dl"), "--no-warnings"];
const YTDL_OPT = { maxBuffer: 1000 * 1000 * 2 };

const TIME_LIMIT = 1000 * 60 * 60 * 2;

const router = express.Router();

const { execFile, spawn } = require("promisify-child-process");

const timeStampToMili = (t) => new Date("1/1/1970 " + t).getTime() + 3600000;

const downloadYTDL = () =>
	new Promise((resv) => {
		const request = require("request");

		request("https://yt-dl.org/downloads/latest/youtube-dl")
			.pipe(fs.createWriteStream(path.join(__dirname, "../bin/youtube-dl")))
			.on("finish", () => {
				resv();
			});
	});

let videoList = {};
let youtubeDLVersion = "?";
let youtubeDLExtractors = [];

router.get("/", (req, res) => {
	res.render("index", {
		youtubeDLVersion,
		youtubeDLExtractors,
		videoList: Object.keys(videoList)
			.filter((i) => videoList[i].status === "done")
			.map((i) => ({ name: videoList[i].fileName, time: i })),
		debugMode: "DEBUG" in process.env
	});
});

(async () => {
	if (!fs.existsSync(path.join(__dirname, "../bin/youtube-dl"))) await downloadYTDL();

	fs.ensureDirSync(path.join(__dirname, "../videos"));

	videoList = {};

	youtubeDLVersion = (await execFile(YTDL, [...YTDL_ARG, "--version"], YTDL_OPT)).stdout.toString().split("\n")[0];

	youtubeDLExtractors = (await execFile(YTDL, [...YTDL_ARG, "--list-extractors"], YTDL_OPT)).stdout
		.toString()
		.split("\n");

	router.post("/getInfo", async (req, res) => {
		if (
			!req.body.url.match(
				/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/
			)
		)
			return res.json({ success: false, error: "URL not valid" });

		try {
			res.json({
				success: true,
				payload: JSON.parse(
					(await execFile(
						YTDL,
						[...YTDL_ARG, "--playlist-end", "1", "--dump-json", "--", req.body.url],
						YTDL_OPT
					)).stdout
						.toString()
						.split("\n")[0]
				)
			});
		} catch (err) {
			console.error(err);

			res.json({ success: false, error: "An error has occured while retrieving info" });
		}
	});

	router.post("/startDownload", async (req, res) => {
		if (
			!req.body.url.match(
				/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/
			)
		)
			return res.json({ success: false, error: "URL not valid" });

		let args = ["--playlist-end", "1", "--add-metadata"];

		if (["mp3", "m4a", "aac", "opus"].includes(req.body.out)) {
			// music
			if (req.body.how === "bestqc") args.push("-x", "--audio-format", req.body.out);
			else if (req.body.how === "customfc") {
				if (!req.body.format) return res.json({ success: false, error: "No format selected" });
				if (req.body.format instanceof Array)
					return res.json({ success: false, error: "Only pick one format" });

				args.push("-f", req.body.format, "--audio-format", req.body.out);
			}
		} else {
			if (req.body.subtitle === "on") args.push("--embed-subs");

			if (req.body.how === "bestqc") args.push("--merge-output-format", req.body.out);
			else if (req.body.how === "customfc") {
				if (!req.body.format) return res.json({ success: false, error: "No format selected" });
				if (!req.body.format instanceof Array || req.body.format.length > 2)
					return res.json({
						success: false,
						error: "Please pick only one video and one audio format"
					});

				args.push("-f", req.body.format[0] + "+" + req.body.format[1], "--merge-output-format", req.body.out);
			}
		}

		if (req.body.how === "customfs") {
			if (!req.body.format) return res.json({ success: false, error: "No format selected" });
			if (req.body.format instanceof Array) return res.json({ success: false, error: "Only pick one format" });

			args.push("-f", req.body.format);
		}

		const uuid = new Date().getTime().toString();

		await fs.ensureDir(path.join(__dirname, "../videos/", uuid));

		const video = spawn(
			YTDL,
			[
				...YTDL_ARG,
				...args,
				"-o",
				`${path.join(__dirname, "../videos/", uuid, "%(title)s.%(ext)s")}`,
				"--newline",
				"--postprocessor-args",
				"-strict -2",
				"--",
				req.body.url
			],
			YTDL_OPT
		);

		video.catch((err) => {
			console.error(err);

			videoList[uuid].status = "failed";
		});

		videoList[uuid] = {
			status: "downloading",
			progress: 0,
			fileName: null
		};

		let ytbuf = "";
		video.stdout.on("data", (data) => {
			if (!videoList[uuid].fileName) {
				ytbuf += data.toString();
				let match = ytbuf.match(/^ *?\[download] Destination: .*\/(.*?)$/m);

				if (match) videoList[uuid].fileName = match[1].substr(match[1].indexOf("/") + 1);
			}

			let dlMatch = data.toString().match(/^ *?\[download] +?(.+?)%/m);
			if (dlMatch) videoList[uuid].progress = parseFloat(dlMatch[1]);

			let ffMatch =
				data.toString().match(/^ *?\[ffmpeg] Destination: .*\/(.*?)$/m) ||
				data.toString().match(/^ *?\[ffmpeg] Merging formats into ".*\/(.*?)"$/m);
			if (ffMatch) videoList[uuid].fileName = ffMatch[1].substr(ffMatch[1].indexOf("/") + 1);
		});

		let duration = -1;

		// ffmpeg is on stderr for some reason uhh
		let ffbuf = "";
		video.stderr.on("data", (data) => {
			if (duration === -1) {
				ffbuf += data.toString();
				if (ffbuf.match(/^  Duration: (.*?), start:/m)) {
					duration = timeStampToMili(ffbuf.match(/^  Duration: (.*?), start:/m)[1]);
					videoList[uuid].status = "converting";
				}
			} else if (data.toString().startsWith("frame=")) {
				let match = data.toString().match(/time=(.*?) /);

				if (match) videoList[uuid].progress = (timeStampToMili(match[1]) / duration) * 100;
			}
		});

		video.on("close", (code) => {
			videoList[uuid].status = code ? "failed" : "done";
		});

		res.json({ success: true, payload: uuid });
	});

	router.get("/checkDownload/:id", (req, res) => {
		if (!(req.params.id in videoList) || videoList[req.params.id].status === "failed")
			return res.json({ success: false, error: "Download failed" });

		if (videoList[req.params.id].status !== "done")
			return res.json({
				success: true,
				payload: {
					done: false,
					status: videoList[req.params.id].status,
					progress: videoList[req.params.id].progress
				}
			});
		else return res.json({ success: true, payload: { done: true } });
	});

	router.get("/download/:id", async (req, res) => {
		if (!(req.params.id in videoList)) return res.send(404);

		try {
			await fs.pathExists(
				path.join(__dirname, "../videos/", req.params.id, "/", videoList[req.params.id].fileName)
			);

			res.download(path.join(__dirname, "../videos/", req.params.id, "/", videoList[req.params.id].fileName));
		} catch (_) {
			res.send(404);
		}
	});

	setInterval(async () => {
		let dirs = await fs.readdir(path.join(__dirname, "../videos/"));
		for (const dir of dirs) {
			if (!parseInt(dir)) continue;

			if (parseInt(dir) < new Date().getTime() - TIME_LIMIT) fs.remove(path.join(__dirname, "../videos/", dir));
		}

		let newVideoList = {};
		Object.keys(videoList).map((i) => {
			if (i >= new Date().getTime() - TIME_LIMIT) newVideoList[i] = videoList[i];
		});

		videoList = newVideoList;
	}, 1000 * 60); // minute
})();

module.exports = router;
