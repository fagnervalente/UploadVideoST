$(function() {
  
  var showInfo = function(message) {
    $('div.progress').hide();
    $('strong.message').text(message);
    $('div.alert').show();
  };
  
  $('form').on('submit', function(evt) {
    evt.preventDefault();

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
        percent.toFixed(2);
        
        $('span.percent').text(percent+'%');
        $('div.progress div.bar').css('width', percent + '%');

        if ( percent >= 100 )
        {
          $('.label-bar').text('Gravando arquivo no servidor...');
        }
      }
    };
    
    xhr.onerror = function(e) {
      console.log(e);
      showInfo('Ocorreu um erro durante o envio do arquivo. Talvez a conexão tenha sido interrompida.');
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
  var countRequest = 0;

  $('.label-bar').text('Aguardando conversor de video...');

  var intervalZStatus = setInterval(function(){
    $.ajax({
      url: '/zstatus',
      type: 'GET',
      dataType: 'JSON',
      success: function(data){

        countRequest ++

        if (!data.error)
        {
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
        }else{
          console.log('Ocorreu um erro');
          clearInterval(intervalZStatus);
          showInfo('Ocorreu um erro durante a conversão do arquivo');
        }

        if ( countRequest >= 2000 )
        {
          if ( confirm('O zencoder está demorando tempo demais para converter o arquivo... Deseja cancelar a ação?') )
            clearInterval(intervalZStatus);
        }
      },
      error: function(){
        console.log('erro');
        clearInterval(intervalZStatus);
        showInfo('Ocorreu um erro durante a conversão do arquivo');
      }
    });

  }, 2000);
}