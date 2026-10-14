// GitBook 3.2 can fail while copying this plugin's standalone CSS asset.
// Keep the same styling with the JavaScript asset so builds remain reliable.
(function () {
	if (document.getElementById('yj-back-to-top-style')) return;
	var style = document.createElement('style');
	style.id = 'yj-back-to-top-style';
	style.textContent = '.back-to-top{position:fixed;bottom:25px;right:25px;background:rgba(0,0,0,.5);width:50px;height:50px;display:none;text-decoration:none;border-radius:35px;z-index:1000}.back-to-top i{color:#fff;margin:0;position:relative;left:15px;top:14px;font-size:22px}.back-to-top:hover{background:rgba(0,0,0,.9);cursor:pointer}.book.color-theme-1 .back-to-top{background:rgba(112,66,20,.5)}.book.color-theme-1 .back-to-top i{color:#f3eacb}.book.color-theme-1 .back-to-top:hover{background:rgba(112,66,20,.9)}.book.color-theme-2 .back-to-top{background:rgba(189,202,219,.5)}.book.color-theme-2 .back-to-top i{color:#1c1f2b}.book.color-theme-2 .back-to-top:hover{background:rgba(189,202,219,.9)}@media only screen and (min-device-width:320px) and (max-device-width:480px) and (-webkit-min-device-pixel-ratio:2) and (orientation:portrait){.back-to-top{bottom:10px;right:10px}}';
	document.head.appendChild(style);
})();

var gitbook = window.gitbook;

gitbook.events.on('page.change', function() {
	
	var back_to_top_button = ['<div class="back-to-top"><i class="fa fa-arrow-up"></i></div>'].join("");
	$(".book").append(back_to_top_button)

	$(".back-to-top").hide();

	$('.book-body,.body-inner').on('scroll', function () {
		if ($(this).scrollTop() > 100) { 
			$('.back-to-top').fadeIn();
		} else {
			$('.back-to-top').fadeOut();
		}
	});

	$('.back-to-top').click(function () { 
		$('.book-body,.body-inner').animate({
			scrollTop: 0
		}, 800);
		return false;
	});
	
});
