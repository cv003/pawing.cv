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
    const laughmp3 = "/assets/audio/laugh.mp3";
    const csshref = "/assets/static/soggy.exe.css";
    const scaryfadeduration = 300;

    function randomuni(a, b) {return a + (b - a) * Math.random()}
    function currentseconds() {return performance.now() / 1000}

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

    function ensurestylesheet(href) {
        if (!href || document.querySelector(`link[data-soggycss="${href}"]`)) {
            return;
        }
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.dataset.soggyCss = href;
        document.head.appendChild(link);
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

            this.laughaudio = new window.Audio(laughmp3);
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
            note.innerText = "thank you for using soggy.exe";
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
            const fadestarttime = this.scaryendtime - (scaryfadeduration / 1000);
            if (this.time < fadestarttime) {
                this.scaryopacity = 1.0;
                this.scaryel.style.opacity = "1";
                return;
            }
            const progress = (this.time - fadestarttime) / (scaryfadeduration / 1000);
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
        ensurestylesheet(opts.csshref || csshref);
        if (window.soggyoverlayinstance) {return window.soggyoverlayinstance}
        let windowinst = new overlaywindow(sogimage, logoimage, runonclick);
        window.soggyoverlayinstance = windowinst;
        return windowinst;
    }

    window.overlaywindow = overlaywindow;
    window.sog = sog;
    window.soggyoverlaymain = main;

    main()

})();