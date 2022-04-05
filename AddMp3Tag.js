const { parse } = require("csv-parse/sync");
const axios = require("axios");
const process = require("process");
const ID3Writer = require("browser-id3-writer");
const path = require("path");
const fs = require("fs");
const asyncPool = require("tiny-async-pool");
const dbUrl = "https://cf.csv-db.studio.a-soul.fans/song_database.csv";

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

async function processAudios(fpath) {
  const audiosPath = path.resolve(fpath);
  const csvdb = await fetchDB();
  dbObject = parseSongCsv(csvdb);
  const audioList = fs.readdirSync(audiosPath);

  outputPath = fs.mkdtempSync(path.join(fpath, "processed-"));
  console.info("Output folder has been created:" + outputPath);
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
    date: _date,
    name: _songName,
    nameorg: row["歌名"].trim(),
    ext_name: row["文件类型"].trim(),
    version: row["版本号"].trim(),
    versionComment: row["版本备注"].trim(),
    orginal_artist: row["原曲艺术家"].trim(),
    artist: row["演唱者"].trim(),
    language: row["语言"].trim(),
  };
}

function addTag(filename) {
  return new Promise(function (resolve, reject) {
    try {
      const songBuffer = fs.readFileSync(path.join(_arguments[0], filename));

      const audioInfo = dbObject.find(
        (song) => filename === song.name + ".mp3"
      );
      if (!audioInfo)
        resolve(filename + "  is skiped because of no reference db info!");

      const writer = new ID3Writer(songBuffer);
      writer
        .setFrame("TIT2", audioInfo.nameorg)
        .setFrame(
          "TIT3",
          `【${audioInfo.version} ${audioInfo.versionComment}】`.trim()
        )
        .setFrame("TPE1", [...audioInfo.artist.split(",")])
        .setFrame("TYER", audioInfo.date.split(".")[0])
        .setFrame(
          "TDAT",
          `${audioInfo.date.split(".")[1]}${audioInfo.date.split(".")[2]}`
        );
      writer.addTag();

      const taggedSongBuffer = Buffer.from(writer.arrayBuffer);
      fs.writeFileSync(path.join(outputPath, filename), taggedSongBuffer);
      console.info("ID3 has been addee for: " + filename);
      resolve(filename);
    } catch (err) {
      reject(err);
    }
  });
}
