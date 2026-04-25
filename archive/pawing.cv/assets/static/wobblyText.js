let speed = 70;
let height = 0.3;
let href = "";  

let wobblyCharsArray = []

wobblyTexts = document.getElementsByClassName('wobble')

for (let textI = 0; textI < wobblyTexts.length; textI++) {
  let wobbleElement = wobblyTexts[textI];
  let wobblyString = wobbleElement.textContent;

  while (wobbleElement.firstChild) {
    wobbleElement.removeChild(wobbleElement.firstChild);
  }

  let consecutiveSpaces = 1;

  for (let i = 0; i < wobblyString.length; i++) {
    let atext = wobblyString.charAt(i);

    if (wobblyString.charAt(i) == ' ') {
      consecutiveSpaces++;
      wobblyCharsArray[i] = null;
      continue
    }
    else {
      atext = ' '.repeat(consecutiveSpaces) + atext;
      consecutiveSpaces = 0;
    }

    let wobblyCharacter = document.createElement("span");
    wobblyCharacter.style.position = "relative";
    wobblyCharacter.textContent = atext;

    if (href) {
      wobblyCharacter.style.cursor = "pointer";
      wobblyCharacter.onclick = function () {
        top.location.href = href;
      };
    }

    wobblyCharsArray[i] = wobblyCharacter;
    wobbleElement.appendChild(wobblyCharacter);
  }
}


requestAnimationFrame(animateWobble);

let elapsed = 0;
let lastTimestamp = 0;
function animateWobble(timestamp) {

  elapsed += (timestamp - lastTimestamp) * speed * 0.0002;

  // Animate each character's vertical position based on a sine wave
  for (let i = 0; i < wobblyCharsArray.length; i++) {
    let wobblyCharacter = wobblyCharsArray[i];

    if (!wobblyCharacter) continue;

    wobblyCharacter.style.top = height * Math.sin(i + elapsed) + "vw";
  }

  lastTimestamp = timestamp;

  requestAnimationFrame(animateWobble);
}
