const images = document.querySelectorAll(".cl");
setVisible("#result", false);

document.addEventListener("DOMContentLoaded", () =>
  wait(10).then(() => {
    document.fonts.onloadingdone = () => {
    setVisible(".page", true);
    }}));

function aller() {
    let anchorElements = document.querySelectorAll("a");
    anchorElements.forEach(function(anchor) {
        anchor.style.fontFamily = "Aller";
    });
}
function helvetica() {
    let anchorElements = document.querySelectorAll("a");
    anchorElements.forEach(function(anchor) {
        anchor.style.fontFamily = "Helvetica";
    });
}

images.forEach((img) => {
    img.addEventListener("mousedown", () => {
        img.classList.add("cl2");
    });
    img.addEventListener("mouseup", () => {
        img.classList.remove("cl2");
    });
    img.addEventListener("mouseleave", () => {
        img.classList.remove("cl2");
    });
});

const meows = Array.from({ length: 5 }, (_, i) => new Howl({ src: [`/m/meow${i + 1}.mp3`] }));
const russianroulette = meows.map(meow => () => meow.play());

document.querySelectorAll(".logom, .logo").forEach(element => {
    element.addEventListener("mousedown", () => {
        russianroulette[Math.floor(Math.random() * russianroulette.length)]();
    });
});