function animateTitle() {
      i >= message.length - 1 ? (i = 0) : i++,
        (document.title = message[i]),
        setTimeout("animateTitle()", 500);
}

const copyToClipboard = str => {
  const el = document.createElement('textarea');
  el.value = str;
  el.setAttribute('readonly', '');
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
};

    var message = [
      "",
      "🟨",
      "𝚘🟨",
      "𝚘𝚠🟨",
      "𝚘𝚠𝚘🟨", // you motherfuckers will blame anything at anyone nowadays
              // i am not removing it in any corcumstances btw fuck you
      "𝚘𝚠𝚘𝚝🟨",
      "𝚘𝚠𝚘𝚝.🟨",
      "𝚘𝚠𝚘𝚝.𝚐🟨",
      "𝚘𝚠𝚘𝚝.𝚐𝚚🟨",
      "𝚘𝚠𝚘𝚝.𝚐𝚚🟨",
      "𝚘𝚠𝚘𝚝.𝚐𝚚🟨",
      "𝚘𝚠𝚘𝚝.𝚐🟨",
      "𝚘𝚠𝚘𝚝.🟨",
      "𝚘𝚠𝚘𝚝🟨",
      "𝚘𝚠𝚘🟨",
      "𝚘𝚠🟨",
      "𝚘🟨",
      "🟨",
      "",
      ],
      i = 0;
    animateTitle();