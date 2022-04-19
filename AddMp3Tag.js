const { parse } = require("csv-parse/sync");
const axios = require("axios");
const process = require("process");
const ffmetadata = require("ffmetadata");
const path = require("path");
const fs = require("fs");
const config = require("config");
const asyncPool = require("tiny-async-pool");
const dbUrl = "https://csv-db.studio.asf.ink/song_database.csv";

const artist_mapping = [];
artist_mapping["向晚"] = "A";
artist_mapping["贝拉"] = "B";
artist_mapping["珈乐"] = "C";
artist_mapping["嘉然"] = "D";
artist_mapping["乃琳"] = "E";
artist_mapping["A-SOUL"] = "F";

const _arguments = process.argv.slice(2);
if (!_arguments || _arguments.length != 1) {
  console.log("Parameter error!");
  process.exit();
}

processAudios(_arguments[0]);
let dbObject = null;
let outputPath = null;
let parameters = null;

async function processAudios(fpath) {
  const audiosPath = path.resolve(fpath);
  const csvdb = await fetchDB();
  dbObject = parseSongCsv(csvdb);
  const audioList = fs.readdirSync(audiosPath);
  parameters = config.get("Tagpatcher");
  outputPath = fs.mkdtempSync(path.join(fpath, "processed-"));
  ffmetadata.setFfmpegPath(parameters.ffmpegPath);
  fileExtention = console.info("Output folder has been created:" + outputPath);
  console.info(
    "***********************Processing Start!************************"
  );
  console.info(
    "****************************************************************"
  );
  for await (const f of asyncPool(30, audioList, addTag)) {
  }
  console.info(
    "***********************Processing Finished!************************"
  );
  console.info("Please check result in:" + outputPath);
}

async function fetchDB() {
  try {
    const res = await axios.get(dbUrl, {
      headers: {
        "Content-Type": "text/csv",
      },
    });

    if (res.status === 200) {
      console.info("DB is loaded successfully!");
      return res.data;
    } else {
      console.log(
        `Failed load DB! HTTP Status: ${res.status} ${res.statusText}`
      );
    }
  } catch (error) {
    const { status, statusText } = error.response;
    console.log(`Error! HTTP Status: ${status} ${statusText}`);
  }
}

function parseSongCsv(csvfile) {
  // 将csv解析为内存对象
  const _csvObject = parse(csvfile, { columns: true });
  const _result = new Array();
  // 转换为对象
  for (const _row of _csvObject) {
    if (_row["日期"].trim() === "") continue;
    _result.push(convertSong(_row));
  }
  return _result;
}

function formatSongName(
  resourcedate,
  artists,
  songName,
  songVersion,
  songVerComm
) {
  const _artist = artists
    .split(",")
    .map((x) => (x = artist_mapping[x.trim()]))
    .sort()
    .join("");

  const _artistTag =
    _artist.length === artists.split(",").length
      ? _artist.length > 3
        ? "F"
        : _artist
      : "L";

  const resourcefilename =
    songVersion.length > 0 || songVerComm.length > 0
      ? `${songName}【${(songVersion + " " + songVerComm).trim()}】`
      : songName;

  const _fileName = `${
    resourcedate + " " + _artistTag + " " + resourcefilename
  }`;

  return _fileName;
}

function convertSong(row) {
  const _date = row["日期"];
  const _songName = formatSongName(
    _date,
    row["演唱者"].trim(),
    row["歌名"].trim(),
    row["版本号"].trim(),
    row["版本备注"].trim()
  );

  // 返回一首歌
  return {
    date: parameters.date ? _date : "",
    name: _songName,
    nameorg: parameters.title ? row["歌名"].trim() : "",
    ext_name: row["文件类型"].trim(),
    version: parameters.versioninfo ? row["版本号"].trim() : "",
    versionComment: parameters.versioninfo ? row["版本备注"].trim() : "",
    orginal_artist: row["原曲艺术家"].trim(),
    artist: parameters.artist ? row["演唱者"].trim() : "",
    language: row["语言"].trim(),
  };
}

function addTag(filename) {
  return new Promise(function (resolve, reject) {
    try {
      const basicname = filename.substring(0, filename.lastIndexOf("."));
      const extname = filename.substring(filename.lastIndexOf(".") + 1);
      const audioInfo = dbObject.find((song) => basicname === song.name);
      if (!audioInfo) {
        console.warn(filename + "  is skiped because of no reference db info!");
        resolve(filename + "  is skiped because of no reference db info!");
        return;
      }
      let _output = null;
      if (extname === "mp3" || extname === "m4a" || extname === "mp4") {
        const tags = {
          title: audioInfo.nameorg,
          TIT3:
            audioInfo.version.length > 0 || audioInfo.versionComment.length > 0
              ? `【${(
                  audioInfo.version +
                  " " +
                  audioInfo.versionComment
                ).trim()}】`
              : "",
          artist: audioInfo.artist,
          genre: `${audioInfo.date};${
            audioInfo.version.length > 0 || audioInfo.versionComment.length > 0
              ? `【${(
                  audioInfo.version +
                  " " +
                  audioInfo.versionComment
                ).trim()}】`
              : ""
          }`,
          comment: `${audioInfo.date};${
            audioInfo.version.length > 0 || audioInfo.versionComment.length > 0
              ? `【${(
                  audioInfo.version +
                  " " +
                  audioInfo.versionComment
                ).trim()}】`
              : ""
          }`,
          date: audioInfo.date,
          lyrics: "",
        };
        fs.writeFileSync(
          path.join(outputPath, filename),
          fs.readFileSync(path.join(_arguments[0], filename))
        );
        ffmetadata.write(path.join(outputPath, filename), tags, function (err) {
          if (err) {
            throw err;
          } else {
            console.info("Tag has been addee for: " + filename);
            resolve(filename);
          }
        });
      } else {
        console.warn(
          filename + "  is skiped because of unsopported audio format!"
        );
        resolve(filename + "  is skiped because of unsopported audio format!");
        return;
      }
    } catch (err) {
      console.error("Tag failed to be addee for: " + filename);
      console.error(err);
      reject(err);
    }
  });
}
