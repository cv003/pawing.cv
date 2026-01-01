// poor notes upcoming, they're not really meant for public but i kept them for anyone else to understand stuff
// погані нотатки, вони не призначені для інших але я все одно зберіг їх щоб хтось міг зрозуміти речі

function removeElementsByClass(className){
    const elements = document.getElementsByClassName(className);
    while(elements.length > 0){
        elements[0].parentNode.removeChild(elements[0]);
    }
}

// code for the book itself
var pages = document.getElementsByClassName('page');
  for(var i = 0; i < pages.length; i++)
    {
      var page = pages[i];
      if (i % 2 === 0)
        {
          page.style.zIndex = (pages.length - i);
        }
    }

  document.addEventListener('DOMContentLoaded', function(){
    for(var i = 0; i < pages.length; i++)
      {
        pages[i].pageNum = i + 1;
        pages[i].onclick=function()
          {
            if (this.pageNum % 2 === 0)
              {
                this.classList.remove('flipped');
                this.previousElementSibling.classList.remove('flipped');
              }
            else
              {
                this.classList.add('flipped');
                this.nextElementSibling.classList.add('flipped');
                setTimeout(function(){ $(".flipped").fadeOut(); }, 300)
              }
           }
        }
  })



// font - Kban [patorjk.com/software/taag/#p=display&f=Kban] (very wacky since there's no support for cyrillic so i had to improvise)
// шрифт - Kban [patorjk.com/software/taag/#p=display&f=Kban] (дуже некрасиво бо немає підтримки кирилиці со я повинен був імпровізувати)
console.log(`%c
'||   ||                                               
 ||  .|    ...   .. ...     ....    ...      ..     
 || .|   .|  '|.  ||  ||  .|   '' .|  '|.   .||.  '|| ... 
 ||'|.   ||   ||  ||  ||  ||      ||   ||  .|''|.  ||'  || 
.||. ||.  '|..|' .||. ||.  '|...'  '|..|' .|'  '|. '|...'  
                                                            `, 'background: #160f19; color: #64daff');

function getBox(width, height) {
    return {
        string: "+",
        style: "font-size: 1px; padding: " + Math.floor(height/2) + "px " + Math.floor(width/2) + "px; line-height: " + height + "px;"
    }
}


// an exploit which lets you send images inside dev console
// експлоіт який дає можливість відправляти фото в консоль
console.image = function(url, scale) {
    scale = scale || 1;
    var img = new Image();

    img.onload = function() {
        var dim = getBox(this.width * scale, this.height * scale);
        console.log("%c" + dim.string, dim.style + "background: url(" + url + "); background-size: " + (this.width * scale) + "px " + (this.height * scale) + "px; color: transparent;");
    };

    img.src = url;
};


// SOGGY CAT ‼️ ‼️ ‼️ i love this cat, his name is shark and his owned is @sillyfuny on twitter (his acc is currently deactivated because of some drama i'm too lazy to take a look into, there's literally like a thread of 30 long tweets)
console.image("https://soggy.cat/img/soggycat.jpg")


// animates the website title by constantly changing it. cause why not? looks pretty goofy for me
// оживляє назву сайту, постійно змінюючи її. чому б і ні? виглядає досить круто для мене
function animateTitle() {
      i >= message.length - 1 ? (i = 0) : i++,
        (document.title = message[i]),
        setTimeout("animateTitle()", 200);
}
    var message = [
   "Пₚₒєᵏᵗ",
   "ⁿрₒₑкᵗ",
   "ⁿᵖоₑₖт",
   "пᵖᵒеₖₜ",
   "прᵒᴱкₜ",
   "пₚоᴱᵏт"
      ],
      i = 0;
    animateTitle();


// hide the warning
// прибрати попередження

function Hide(HideID) 
{
  HideID.style.display = "none"; 
}
