$(function() {
  
  var showInfo = function(message) {
    $('div.progress').hide();
    $('strong.message').text(message);
    $('div.alert').show();
  };
  
  $('form').on('submit', function(evt) {
    evt.preventDefault();
    console.log('eita');

    $('div.progress').show();

    $('.label-bar').text('Enviando video');
    var formData = new FormData();
    var file = document.getElementById('myFile').files[0];
    formData.append('myFile', file);
    
    var xhr = new XMLHttpRequest();
    
    xhr.open('post', '/', true);
    
    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable) {
        var percent = (e.loaded / e.total) * 100;
        $('span.percent').text(percent+'%');
        $('div.progress div.bar').css('width', percent + '%');
      }
    };
    
    xhr.onerror = function(e) {
      showInfo('An error occurred while submitting the form. Maybe your file is too big');
    };
    
    xhr.onload = function() {
      //showInfo(this.statusText);
      ProcessEncode();
    };
    
    xhr.send(formData);
    
  });
  
});

function ProcessEncode()
{
  $('.label-bar').text('Aguardando conversor de video...');

  var intervalZStatus = setInterval(function(){
    $.ajax({
      url: '/zstatus',
      type: 'GET',
      dataType: 'JSON',
      success: function(data){

        //if (!data.error)
        //{
          console.log(data.nome + ' | ' + data.percent);


          if ( data.nome != '' || data.percent > 0 )
          {
            $('.label-bar').text(data.nome);
            $('div.progress').show();
            $('span.percent').text(data.percent+'%');
            $('div.progress .bar').css('width', data.percent + '%');
          }

          if ( data.percent == 100 )
          {
            clearInterval(intervalZStatus);
            $('.label-bar').text('Salvando arquivo no servidor...');
            window.location = '/video?url='+data.url;
          }
        //}else{
          //console.log('Ocorreu um erro');
        //}
      },
      error: function(){
        console.log('erro');
      }
    });

  }, 1000);
}