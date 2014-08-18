var express = require('express')
  , http = require('http')
  , path = require('path')
  , Zencoder = require('zencoder')
  , StreamingS3 = require('streaming-s3')
  , readline = require('readline')
  , fs = require('fs');

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

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser({ 
    keepExtensions: true, 
    uploadDir: __dirname + '/tmp'
  }));
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

// Routes

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

    var fStream = fs.createReadStream(file.path);

    var uploader = new StreamingS3(
      fStream, 
      'AKIAIAVZOEWUYDLYL4QA', 
      'YcFIMeT8l35ppqyMi0hz244wG+qs4uLjEtAwpMgW',
      {
        Bucket: BUCKET_NAME,
        Key: file.name,
        ContentType: file.type
      }
    );

    uploader.begin(); // important if callback not provided.

    uploader.on('data', function (bytesRead) {
      console.log(bytesRead, ' bytes read.');
    });

    uploader.on('part', function (number) {
      console.log('Part ', number, ' uploaded.');
    });

    // All parts uploaded, but upload not yet acknowledged.
    uploader.on('uploaded', function (stats) {
      console.log('Upload stats: ', stats);
    });

    uploader.on('finished', function (resp, stats) {

      console.log('resp.location = '+resp.Location);

      //fs.chmodSync(resp.Location, 777);

      res.end();
      
      console.log('Upload finished: ', resp);

      var arrayUrlBucket = resp.Location.split('/');

      var urlBucketEncodeds = arrayUrlBucket[0] + '//' + arrayUrlBucket[2] + '/' + 'zen-' + file.name;

      console.log(urlBucketEncodeds);

      client.Job.create({
        input: resp.Location,
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
        console.log('Job created!\nJob ID: ' + data.id);

        zstatus.url = urlBucketEncodeds;

        poll(data.id); 
      });

    });

    uploader.on('error', function (e) {
      console.log('Upload error: ', e);
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

/*app.post('/', function(req, res) {
  deleteAfterUpload(req.files.myFile.path);
  res.end();
});*/

// Start the app

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

// Private functions

var fs = require('fs');

var deleteAfterUploadS3 = function(path) {
    fs.unlink(path, function(err) {
      if (err) console.log(err);
    });
};

var poll = function(id) {
  setTimeout(function(){
    client.Job.progress(id, function(err, data) {
      if (err) { 
        console.log("OH NO! There was an error");
        zstatus.error = true;
        return err; 
      } 
      if (data.state == 'waiting') {
        if (!this.status || this.status != 'waiting') {
          
          zstatus.nome = 'Aguardando zencoder';
          zstatus.error = false;

          this.status = 'waiting'; // set status to waiting so we can start adding dots.
        } else {
          // keep adding '.' until we start processing
        }

        poll(id);

      } else if (data.state == 'processing') {
        var progress = Math.round(data.progress * 100) / 100;

        zstatus.percent = progress;
        zstatus.nome = 'Convertendo video para mp4';
        zstatus.error = false;

        rl.write(null, {ctrl: true, name: 'u'}); // clear the current status so we can update progress
        rl.write('Processing: ' + progress + '%');
        this.status = 'processing';

        poll(id);

      } else if (data.state == 'finished') {
        console.log('Video Encodado');
        zstatus.nome = 'Vídeo encodado!';
        zstatus.percent = 100;
        zstatus.error = false;

      }
    }, 5000);
  })
};