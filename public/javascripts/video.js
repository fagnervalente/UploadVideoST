$(function(){
	$('#link-video').on('click', function(){
		$(this).select();
	});

	$('video').on('play', function(){
		$('body.transition-all').addClass('shadow');
	}).on('pause', function(){
		$('body.transition-all').removeClass('shadow');
	});
});