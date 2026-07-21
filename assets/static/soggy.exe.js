// soggy.exe but as a page overlay

(function () {

    const dontautostart = true;

    const sogcount = 5;
    const heightratio = 0.2;
    const hspeed = 50.0;
    const gravity = 2000.0;
    const jumpspeed = 900.0;
    const minjumpinterval = 3.0;
    const maxjumpinterval = 20.0;
    const targetfps = 30;
    const frametime = 1.0 / targetfps;

    const sogimg = "/assets/images/soggyexe/sog.webp";
    const logoimg = "/assets/images/soggyexe/logo.webp";
    const scarygif = "/assets/images/soggyexe/scary.gif";
    const laughaudiourl = "/assets/audio/laugh.mp3";
    const scaryfadeduration = 300;
    const inlinecss = `.soggyoverlay {
		    position: fixed;
		    left: 0; top: 0;
		    width: 100vw; height: 100vh;
		    pointer-events: none; user-select: none;
		    z-index: 2147483646;
		    background: transparent;
		}

		.soggyscary {
		    position: absolute;
		    inset: 0; width: 100%; height: 100%;
		    object-fit: cover;
		    opacity: 0; display: none;
		    pointer-events: none; user-select: none;
		}

		.soggyoverlaycanvas {
		    width: 100%; height: 100%;
		    display: block;
		}

		.soggytraybtn {
		    position: fixed;
		    top: 1em; left: 1em;
		    width: 20px; height: 20px;
		    z-index: 2147483647;
		    pointer-events: auto;
		    cursor: pointer;

		    display: flex; padding: 6px;
		    z-index: 999; border-radius: 0 0 16px 0;
		    background: rgba(0,0,0,0.1);
		    backdrop-filter: grayscale(100%) blur(10px);
		    left: 0; top: 0;
		}

		/*//////////////////////////////////////////////////////////////////////*/

		.soggymenu {
		    position: fixed;
		    background: #f2f2f2;
		    z-index: 2147483648;
		    padding: 0.25em 0; min-width: 190px;
		    font-family: Helvetica !important;
		    font-size: 1.5em;
		}

		.soggymenunote {
		    color: rgba(0,0,0,0.5);
		    padding: 8px 16px; 
		    opacity: 0.85;
		    user-select: none;
		    font-family: Helvetica !important;
		}

		.soggymenuitem {
		    color: black;
		    padding: 10px 18px;
		    cursor: pointer;
		    font-family: Helvetica !important;
		}

		.soggymenuitem:hover {background: #90c8f6}`;

    const currentscript = document.currentScript;
    const scriptsrcurl = (currentscript && currentscript.src) || "/assets/static/soggy.exe.js";

    function randomuni(a, b) {return a + (b - a) * Math.random()}
    function currentseconds() {return performance.now() / 1000}

    function fetchasdatauri(url) {
        return fetch(url, {cache: "no-store"}).then(r => r.blob()).then(blob => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        }));
    }

    function triggerdownload(filename, text) {
        const blob = new Blob([text], {type: "application/javascript"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a);
        a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /*//////////////////////////////////////////////////////////////////////*/

    class sog {
        constructor(pixmap, viewportwidth, viewportheight) {
            this.pixmap = pixmap;
            this.naturalwidth = pixmap.width; this.naturalheight = pixmap.height;
            const basescale = (viewportheight * heightratio) / this.naturalheight;
            const scalefactor = basescale * randomuni(0.6, 1);
            this.sizew = this.naturalwidth * scalefactor;
            this.sizeh = this.naturalheight * scalefactor;
            this.basesizew = this.sizew; this.basesizeh = this.sizeh;
            this.dir = Math.random() < 0.5 ? -1.0 : 1.0;
            this.basey = viewportheight - this.sizeh;
            this.vely = 0.0; this.nextjumptime = 0.0;
            const maxx = Math.max(0.0, viewportwidth - this.sizew);
            this.posx = randomuni(0.0, maxx);
            this.posy = this.basey;
            this.cachedcanvas = null;
            this.cachedwidth = null;
            this.cachedheight = null;
        }

        isonfloor() {return Math.abs(this.posy - this.basey) < 0.5 && this.vely === 0.0}
        scaledpixmap() {
            if (this.cachedcanvas &&
                this.cachedwidth === this.sizew &&
                this.cachedheight === this.sizeh) {
                return this.cachedcanvas;
            }

            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(this.sizew));
            canvas.height = Math.max(1, Math.round(this.sizeh));
            const ctx = canvas.getContext('2d');
            ctx.drawImage(this.pixmap, 0, 0, canvas.width, canvas.height);
            this.cachedcanvas = canvas;
            this.cachedwidth = this.sizew;
            this.cachedheight = this.sizeh;
            return canvas;
        }
    }

    function injectinlinecss(css) {
        if (document.querySelector("style[data-soggycss]")) return;
        const style = document.createElement("style");
        style.dataset.soggyCss = "1";
        style.textContent = css;
        document.head.appendChild(style);
    }

    class overlaywindow {
        constructor(sogimageurl, logoimageurl, runonclick = dontautostart) {
            this.scale = 1.0;
            this.runontrayclick = !!runonclick;
            this.isrunning = !this.runontrayclick;
            this.el = document.createElement('div');
            this.el.className = "soggyoverlay"; this.el.tabIndex = -1;
            this.scaryel = document.createElement("img");
            this.scaryel.className = "soggyscary";
            this.scaryel.draggable = false;
            this.el.appendChild(this.scaryel);
            this.canvas = document.createElement('canvas');
            this.canvas.className = "soggyoverlaycanvas";
            this.el.appendChild(this.canvas);

            document.body.appendChild(this.el);
            this.scaryimage = new window.Image();
            this.scaryimage.src = scarygif;
            this.scaryloaded = false; this.scaryactive = false;
            this.scaryopacity = 0.0; this.scarystarttime = 0;
            this.scaryendtime = 0; this.scarynaturalduration = 0;
            this.scaryfadestarted = false;

            this.laughaudio = new window.Audio(laughaudiourl);
            this.laughaudio.preload = "auto";
            this.laughaudio.playbackRate = 0.7;

            this.loadpixmaps(sogimageurl, logoimageurl, scarygif);
            window.addEventListener('resize', () => this.applyscale(true));
        }

        loadpixmaps(sogimg, logoimg, scaryimg) {
            this.sogpixmap = new window.Image();
            this.logopixmap = new window.Image();
            this.scaryimage = new window.Image();
            let loaded = 0;
            const needed = 3;
            const done = () => {if (++loaded === needed) this.afterloading()};
            this.sogpixmap.onload = done;
            this.sogpixmap.onerror = done;
            this.logopixmap.onload = done;
            this.logopixmap.onerror = done;
            this.scaryimage.onload = () => {
                this.scaryloaded = true;
                this.scaryel.src = this.scaryimage.src;
                done();
            };
            this.scaryimage.onerror = done;

            this.sogpixmap.src = sogimg || sogimg;
            this.logopixmap.src = logoimg || logoimg;
            this.scaryimage.src = scaryimg || scarygif;
        }

        createsogs() {
            const w = this.canvas.width;
            const h = this.canvas.height;
            this.sogs = [];
            let now = this.gettime();
            for (let i = 0; i < sogcount; ++i) {
                const s = new sog(this.sogpixmap, w, h);
                s.nextjumptime = now + randomuni(minjumpinterval, maxjumpinterval);
                this.sogs.push(s);
            }
        }

        gettime() {return (performance.now() / 1000) - this.inittimestamp}
        tick() {
            if (!this.isrunning) {
                this.tickt = setTimeout(() => this.tick(), frametime * 1000);
                return;
            }
            this.tickt = setTimeout(() => this.tick(), frametime * 1000);

            let delta = frametime;
            this.time += delta;
            let viewportwidth = this.canvas.width;
            for (let s of this.sogs) {
                let x = s.posx + hspeed * s.dir * delta;
                if (x < 0.0) {x = 0.0; s.dir = 1.0}
                else if (x + s.sizew > viewportwidth) {
                    x = viewportwidth - s.sizew;
                    s.dir = -1.0;
                }

                if (this.time >= s.nextjumptime && s.isonfloor()) {
                    s.vely = -jumpspeed;
                    s.nextjumptime = this.time + randomuni(minjumpinterval, maxjumpinterval);
                }

                s.vely += gravity * delta;
                let y = s.posy + s.vely * delta;
                if (y >= s.basey) {y = s.basey; s.vely = 0.0}
                s.posx = x; s.posy = y;
            }
            this.updatescarystate(); this.update();
        }

        applyscale(force) {
            const w = window.innerWidth;
            const h = window.innerHeight;
            if (this.canvas.width !== w || this.canvas.height !== h || force) {
                this.canvas.width = w;
                this.canvas.height = h;
                this.floory = h;
            }
            if (!this.sogs) return;
            if (!this.isrunning) { // fix sogs appearing when changing window size
                this.update();
                return;
            }
            for (let s of this.sogs) {
                let floor = this.floory;
                let oldbottom = s.posy + s.sizeh;
                let olddistanceabove = floor - oldbottom;

                s.sizew = s.basesizew * this.scale;
                s.sizeh = s.basesizeh * this.scale;
                s.basey = floor - s.sizeh;
                let newbottom = floor - olddistanceabove;
                let newy = newbottom - s.sizeh; s.posy = newy;
                s.cachedcanvas = null; s.cachedwidth = null;
            }
            this.update();
        }

        scaleup() {
            this.scale = Math.min(2.0, this.scale + 0.25);
            this.applyscale();
        }
        scaledown() {
            this.scale = Math.max(0.25, this.scale - 0.25);
            this.applyscale();
        }

        update() {
            const ctx = this.canvas.getContext('2d');
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            if (!this.isrunning) return;
            for (let s of this.sogs) {
                const canvas = s.scaledpixmap();
                ctx.drawImage(canvas, s.posx, s.posy, s.sizew, s.sizeh);
            }
        }

        async downloadstandalone() {
            try {
                const src = await (await fetch(scriptsrcurl, {cache: "no-store"})).text();
                let out = src;
                for (const url of [sogimg, logoimg, scarygif, laughaudiourl]) {
                    const datauri = await fetchasdatauri(url);
                    out = out.split(JSON.stringify(url)).join(JSON.stringify(datauri));
                }
                triggerdownload("soggy.exe.js", out);
            } catch (e) {
                window.alert("could not build soggy.exe (assets failed to load)");
            }
        }

        /*//////////////////////////////////////////////////////////////////////*/

        createtray() {
            this.traybtn = document.createElement('img');
            this.traybtn.src = this.logopixmap.src;
            this.traybtn.className = "soggytraybtn";
            this.traybtn.title = "soggy overlay";
            document.body.appendChild(this.traybtn);
            this.traybtn.addEventListener('click', evt => {
                evt.preventDefault();
                if (this.runontrayclick && !this.isrunning) {
                    this.beginrun();
                    return;
                }
                this.coolmenu(evt.clientX, evt.clientY);
            });
        }

        coolmenu(x, y) {
            if (this.menuel) {
                this.menuel.remove();
            }
            const menu = document.createElement('div');
            menu.className = "soggymenu";
            menu.style.left = x + "px";
            menu.style.top = y + "px";

            let note = document.createElement('div');
            note.innerText = "evil sogs..................";
            note.className = "soggymenunote";
            menu.appendChild(note);
            menu.appendChild(document.createElement('hr'));

            const menuchoice = (label, cb) => {
                let item = document.createElement('div');
                item.innerText = label;
                item.className = "soggymenuitem";
                item.onclick = () => {cb(); menu.remove()};
                menu.appendChild(item);
            };
            menuchoice("scale up", () => this.scaleup());
            menuchoice("scale down", () => this.scaledown());
            menuchoice("download", () => this.downloadstandalone());

            menu.appendChild(document.createElement('hr'));

            menuchoice("exit", () => this.exit());
            document.body.appendChild(menu);
            this.menuel = menu;
            let dismiss = (evt) => {
                if (!menu.contains(evt.target) && evt.target !== this.traybtn) {
                    menu.remove();
                    window.removeEventListener('mousedown', dismiss, true);
                }
            };
            window.addEventListener('mousedown', dismiss, true);
        }

        exit() {
            if (this.tickt) clearTimeout(this.tickt);
            if (this.laughaudio) {
                this.laughaudio.pause();
                this.laughaudio.currentTime = 0;
            }
            if (this.menuel) this.menuel.remove();
            if (this.traybtn) this.traybtn.remove();
            if (this.el) this.el.remove();
        }
        startintro() {
            if (this.scaryloaded) {
                this.scaryactive = true;
                this.scaryopacity = 1.0;
                this.scaryfadestarted = false;
                this.scarystarttime = this.time;
                const gifduration = 2; // seconds
                this.scarynaturalduration = gifduration > 0 ? gifduration : 2.5;
                this.scaryendtime = this.scarystarttime + this.scarynaturalduration;
                this.scaryel.style.opacity = "1";
                this.scaryel.style.display = "block";
                this.scaryel.src = "";
                this.scaryel.src = this.scaryimage.src;
            }

            const playpromise = this.laughaudio.play();
            if (playpromise && typeof playpromise.catch === "function") {
                playpromise.catch(() => {});
            }
        }
        updatescarystate() {
            if (!this.scaryactive) return;
            const fadestarttime = this.scaryendtime - (scaryfadeduration / 750);
            if (this.time < fadestarttime) {
                this.scaryopacity = 1.0;
                this.scaryel.style.opacity = "1";
                return;
            }
            const progress = (this.time - fadestarttime) / (scaryfadeduration / 750);
            this.scaryopacity = Math.max(0.0, 1.0 - progress);
            this.scaryel.style.opacity = String(this.scaryopacity);
            if (this.scaryopacity <= 0.0) {
                this.scaryopacity = 0.0;
                this.scaryactive = false;
                this.scaryel.style.display = "none";
            }
        }
        beginrun() {
            this.isrunning = true;
            this.startintro();
        }
        afterloading() {
            const w = window.innerWidth; const h = window.innerHeight;
            this.canvas.width = w; this.canvas.height = h;
            this.floory = h;
            this.inittimestamp = performance.now() / 1000;
            this.time = 0.0;
            this.createsogs(); this.createtray();
            if (this.isrunning) {
                this.startintro();
            }
            this.tick();
        }
    }

    /*//////////////////////////////////////////////////////////////////////*/

    function main(opts = {}) {
        let sogimage = opts.sogimage || sogimg;
        let logoimage = opts.logoimage || logoimg;
        const runonclick = typeof opts.dontautostart === "boolean" ? opts.dontautostart : dontautostart;
        injectinlinecss(inlinecss);
        if (window.soggyoverlayinstance) {return window.soggyoverlayinstance}
        let windowinst = new overlaywindow(sogimage, logoimage, runonclick);
        window.soggyoverlayinstance = windowinst;
        return windowinst;
    }

    window.overlaywindow = overlaywindow;
    window.sog = sog;
    window.soggyoverlaymain = main;

    if (document.body) {main()}
    else {window.addEventListener("DOMContentLoaded", () => main())}

})();
