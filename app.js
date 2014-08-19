var express = require('express')
  , http = require('http')
  , path = require('path')
  , Zencoder = require('zencoder')
  , readline = require('readline')
  , fs = require('fs')
  , AWS = require('aws-sdk');

AWS.config.loadFromPath('./awsconfig.json');
var s3 = new AWS.S3();

var client = new Zencoder('c97c15d27e8f792f34f16af728552119');
var BUCKET_NAME = 'teste-bucket-fagner';

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var zstatus = {
  nome: '',
  percent: 0,
  url: '',
  error: false
};

 
// Upload
var startTime = new Date();
var partSize = 1024 * 1024 * 5; // Minimum 5MB per chunk (except the last part) http://docs.aws.amazon.com/AmazonS3/latest/API/mpUploadComplete.html

var maxUploadTries = 3;

var multipartMap = {
    Parts: []
};

var multiUploadDone = false;

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser({ 
    keepExtensions: true, 
    uploadDir: __dirname + '/tmp',
    maxFieldsSize:'2 * 1024 * 1024 * 1024',
    timeout: '120000'
  }));
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.get('/', function(req, res) {
  res.render('index');
});

app.get('/zstatus', function(req, res){

  res.send('{ "nome": "'+zstatus.nome+'", "percent": "'+zstatus.percent+'", "url": "'+zstatus.url+'", "error": '+zstatus.error+' }');
  res.end();

});

app.post('/', function(req, res){

    var file = req.files.myFile;

    fs.chmodSync(file.path, 777);

    //var fStream = fs.createReadStream(file.path);

    var fStream = fs.readFileSync(file.path);

    //var buffer = fs.readFileSync('./' + filePath);

    // Multipart
    //console.log("Creating multipart upload for:", file.name);

    var multiPartParams = {
        Bucket: BUCKET_NAME,
        Key: file.name,
        ContentType: file.type,
        ACL: 'public-read-write'
    };

    var numPartsLeft = Math.ceil(fStream.length / partSize);

    s3.createMultipartUpload(multiPartParams, function(mpErr, multipart){

      if (mpErr) { console.log('Error!', mpErr); return; }
      //console.log("Got upload ID", multipart.UploadId);

      var partNum = 0;
      // Grab each partSize chunk and upload it as a part
      for (var rangeStart = 0; rangeStart < fStream.length; rangeStart += partSize) {
        partNum++;
        var end = Math.min(rangeStart + partSize, fStream.length),
            partParams = {
              Body: fStream.slice(rangeStart, end),
              Bucket: BUCKET_NAME,
              Key: file.name,
              PartNumber: String(partNum),
              UploadId: multipart.UploadId
            };
     
        // Send a single part
        //console.log('Uploading part: #', partParams.PartNumber, ', Range start:', rangeStart);
        uploadPart(s3, multipart, partParams, numPartsLeft);
      }

      var processDownload = setInterval(function(){

        if ( multiUploadDone )
        {
          clearInterval(processDownload);
          multiUploadDone = false;
          res.end();
        }

      }, 300);

    });

});

app.get('/video', function(req, res){

    if ( req.query.url == undefined )
    {
        res.write('<h1>Este vídeo não existe</h1');      
    }
    else
    {
        res.render('video', { url: req.query.url });
    }

    res.end();

});

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});


var poll = function(id) {
  setTimeout(function(){
    client.Job.progress(id, function(err, data) {
      if (err) { 
        console.log("OH NO! There was an error");
        console.log(err);
        zstatus.error = true;
        return err; 
      } 

      //console.log('progress output: ' + data);

      if (data.state == 'waiting') 
      {
        if (!this.status || this.status != 'waiting') 
        {
          zstatus.nome = 'Aguardando zencoder';
          zstatus.error = false;
          this.status = 'waiting';
        } 

        poll(id);

      } 
      else if (data.state == 'processing') 
      {
        var progress = Math.round(data.progress * 100) / 100;

        zstatus.percent = progress;
        zstatus.nome = 'Convertendo video para mp4';
        zstatus.error = false ;

        rl.write(null, {ctrl: true, name: 'u'});
        rl.write('Processing: ' + progress + '%');
        this.status = 'processing';

        poll(id);

      } 
      else if (data.state == 'finished') 
      {
        //console.log('Video Encodado');
        zstatus.nome = 'Vídeo encodado!';
        zstatus.percent = 100;
        zstatus.error = false;
      }
    }, 5000);
  });
};

function completeMultipartUpload(s3, doneParams) {

  multiUploadDone = true;

  s3.completeMultipartUpload(doneParams, function(err, data) {
    if (err) {
      console.log("An error occurred while completing the multipart upload");
      console.log(err);
    } else {
      var delta = (new Date() - startTime) / 1000;
      //console.log('Completed upload in', delta, 'seconds');
      //console.log('Final upload data:', data);

      var paramsObjectAcl = {
        Bucket: BUCKET_NAME,
        Key: doneParams.Key
      };

      var arrayUrlBucket = data.Location.split('/');

      var urlBucketEncodeds = arrayUrlBucket[0] + '//' + arrayUrlBucket[2] + '/encode/' + doneParams.Key;

      //console.log(urlBucketEncodeds);

      client.Job.create({
        input: data.Location,
        outputs: [{
          "url": urlBucketEncodeds,
          "public": true
        }]
      }, function(err, data){
        if (err) 
        { 
            console.log("OH NO! There was an error");
            console.log(err); 
            return err; 
        }
        //console.log('Job created!\nJob ID: ' + data.id);

        zstatus.url = urlBucketEncodeds;

        poll(data.id); 
      });


    }
  });
}

function uploadPart(s3, multipart, partParams, tryNum, numPartsLeft) {
  var tryNum = tryNum || 1;
  s3.uploadPart(partParams, function(multiErr, mData) {
    if (multiErr){
      console.log('multiErr, upload part error:', multiErr);
      if (tryNum < maxUploadTries) {
        //console.log('Retrying upload of part: #', partParams.PartNumber)
        uploadPart(s3, multipart, partParams, tryNum + 1);
      } else {
        //console.log('Failed uploading part: #', partParams.PartNumber)
      }
      return;
    }
    multipartMap.Parts[this.request.params.PartNumber - 1] = {
      ETag: mData.ETag,
      PartNumber: Number(this.request.params.PartNumber)
    };
    //console.log("Completed part", this.request.params.PartNumber);
    //console.log('mData', mData);
    if (--numPartsLeft > 0) return; // complete only when all parts uploaded
 
    var doneParams = {
      Bucket: BUCKET_NAME,
      Key: partParams.Key,
      MultipartUpload: multipartMap,
      UploadId: multipart.UploadId
    };
 
    //console.log("Completing upload...");
    completeMultipartUpload(s3, doneParams);
  });
}