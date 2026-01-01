// ==UserScript==
// @name             ReplaXe
// @version          1.0
// @description      You will never be a real Twitter. You have no tweets, you have no replies, you have no retweets.
// @description:en   You are a ruined platform twisted by laxity and sloth into a crude mockery of Jack’s perfection.
// @icon             https://void.cat/d/5hAPtjVHQYCXLMtFqMFQAd
// @author           cv
// @homepageURL      https://twitter.com/cvsilly_
// @match            *://*.twitter.com/*
// ==/UserScript==

(function() {
    'use strict';

    function removeBlacklistedSVG() {
        const blacklistedString = '<path d="M14.258 10.152L23.176 0h-2.113l-7.747 8.813L7.133 0H0l9.352 13.328L0 23.973h2.113l8.176-9.309 6.531 9.309h7.133zm-2.895 3.293l-.949-1.328L2.875 1.56h3.246l6.086 8.523.945 1.328 7.91 11.078h-3.246zm0 0"></path>';
        const svgElements = document.querySelectorAll('path');

        svgElements.forEach((svgElement) => {
            if (svgElement.outerHTML.includes(blacklistedString)) {
                svgElement.remove();
            }
        });
    }

    var link = document.querySelector("link[rel~='icon']");


    setInterval(function() {

        // replace the logo
        const elements = document.querySelectorAll('.r-lrvibr.r-6416eg.r-o7ynqc.r-1ny4l3l.r-64el8z.r-19yznuf.r-1loqt21.r-rs99b7.r-1phboty.r-sdzlij.r-42olwf.r-1niwhzg.css-1dbjc4n.css-18t94o4.css-4rbku5 > .r-qvutc0.r-q4m81j.r-bcqeeo.r-rjixqe.r-1777fci.r-b88u0q.r-a023e6.r-37j5jr.r-16y2uox.r-18u37iz.r-6koalj.r-1awozwy.css-901oao');
        elements.forEach((element) => {
            element.innerHTML = `<div dir="ltr" class="css-901oao r-1awozwy r-6koalj r-18u37iz r-16y2uox r-37j5jr r-a023e6 r-b88u0q r-1777fci r-rjixqe r-bcqeeo r-q4m81j r-qvutc0" style="color: rgb(239, 243, 244);"><svg xmlns='http://www.w3.org/2000/svg' xml:space='preserve' viewBox='0 0 248 204' width='2.3em' height='2.3em'><path fill='#1d9bf0' d='M221.95 51.29c.15 2.17.15 4.34.15 6.53 0 66.73-50.8 143.69-143.69 143.69v-.04c-27.44.04-54.31-7.82-77.41-22.64 3.99.48 8 .72 12.02.73 22.74.02 44.83-7.61 62.72-21.66-21.61-.41-40.56-14.5-47.18-35.07 7.57 1.46 15.37 1.16 22.8-.87-23.56-4.76-40.51-25.46-40.51-49.5v-.64c7.02 3.91 14.88 6.08 22.92 6.32C11.58 63.31 4.74 33.79 18.14 10.71c25.64 31.55 63.47 50.73 104.08 52.76-4.07-17.54 1.49-35.92 14.61-48.25 20.34-19.12 52.33-18.14 71.45 2.19 11.31-2.23 22.15-6.38 32.07-12.26-3.77 11.69-11.66 21.62-22.2 27.93 10.01-1.18 19.79-3.86 29-7.95-6.78 10.16-15.32 19.01-25.2 26.16z'/></svg><span class="css-901oao css-16my406 css-1hf3ou5 r-poiln3 r-1inkyih r-rjixqe r-bcqeeo r-qvutc0"></span></div>`;
        })

        // replace the copyright
        const elements2 = document.querySelectorAll('div.r-qvutc0.r-j2kj52');
        elements2.forEach((element) => {
            if (element.textContent.includes("X Corp.")) {
                element.innerHTML = `<span class="css-901oao css-16my406 r-poiln3 r-bcqeeo r-qvutc0">© 2023 Twitter Inc.</span>`
            }
        })

        // mock the fraud
        const elements3 = document.querySelectorAll('.r-qvutc0.r-1udh08x.r-bcqeeo.r-135wba7.r-1vr29t4.r-adyw6z.r-37j5jr.r-6koalj.r-1nao33i.r-1awozwy.css-901oao > .r-qvutc0.r-bcqeeo.r-poiln3.css-16my406.css-901oao > span.r-qvutc0.r-bcqeeo.r-poiln3.css-16my406.css-901oao');
        elements3.forEach((element) => {
            if (element.textContent.includes("Elon Musk")) {
                element.innerHTML = `Idiot`
            }
        })

        // remove the other minor occurances of the logo completely
        removeBlacklistedSVG();

        // replace the favicon
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = 'https://twitter.com/favicon.ico';

    }, 100)

})();