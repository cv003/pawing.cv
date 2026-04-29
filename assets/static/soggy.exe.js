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
    const csshref = "/assets/static/soggy.exe.css";
    const scaryfadeduration = 300;
    const popupsizefactor = 1.5;
    const popuprretrymaxattempts = 6;
    const popupretrydelayms = 600;

    function randomuni(a, b) {return a + (b - a) * Math.random()}
    function currentseconds() {return performance.now() / 1000}
    function isdesktopdevice() {
        return !!(window.matchMedia &&
            window.matchMedia("(pointer: fine)").matches && // this is awful
            !window.matchMedia("(hover: none)").matches);
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
            this.popuppermissionchecked = false;
            this.usepopupmode = false;
            this.sogpopups = [];
            this.popupretrytimer = null;
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

            this.laughaudio = new window.Audio("/assets/audio/laugh.mp3");
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
            this.closepopupwindows();
            let now = this.gettime();
            for (let i = 0; i < sogcount; ++i) {
                const s = new sog(this.sogpixmap, w, h);
                s.popupwindow = null;
                s.popupfailures = 0;
                s.popupnextretryat = 0;
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
            if (this.usepopupmode) {
                this.syncpopupwindows(true);
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
            if (this.usepopupmode) {
                this.syncpopupwindows(false);
                return;
            }
            for (let s of this.sogs) {
                const canvas = s.scaledpixmap();
                ctx.drawImage(canvas, s.posx, s.posy, s.sizew, s.sizeh);
            }
        }

        getpopuppositionforsog(s) {
            const chromeleft = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
            const chrometop = Math.max(0, window.outerHeight - window.innerHeight - chromeleft);
            const popupwidth = Math.max(1, Math.round(s.sizew * popupsizefactor));
            const popupheight = Math.max(1, Math.round(s.sizeh * popupsizefactor));
            const offsetx = Math.round((popupwidth - s.sizew) / 2);
            const offsety = Math.round((popupheight - s.sizeh) / 2);
            return {
                x: Math.round(window.screenX + chromeleft + s.posx - offsetx),
                y: Math.round(window.screenY + chrometop + s.posy - offsety)
            };
        }

        createsogpopup(s, index) {
            const popupwidth = Math.max(1, Math.round(s.sizew * popupsizefactor));
            const popupheight = Math.max(1, Math.round(s.sizeh * popupsizefactor));
            const popup = window.open(
                "", `soggypopup${index}_${Date.now()}`,
                `popup=yes,width=${popupwidth},height=${popupheight},left=0,top=0,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
            );
            if (!popup || popup === window) {
                return null;
            }

            popup.document.title = "sog";
            popup.document.documentElement.style.background = "#3e3e3e";
            popup.document.body.style.margin = "0";
            popup.document.body.style.overflow = "hidden";
            popup.document.body.style.width = "100vw";
            popup.document.body.style.height = "100vh";
            popup.document.body.style.background = "#3e3e3e";
            const img = popup.document.createElement("img");
            img.src = this.sogpixmap.src;
            img.draggable = false;
            img.style.display = "block";
            img.style.width = "100vw";
            img.style.height = "100vh";
            img.style.objectFit = "contain";
            popup.document.body.appendChild(img);
            try {popup.focus()} catch (_) {}
            return popup;
        }

        closepopupwindows() {
            if (this.popupretrytimer) {
                clearTimeout(this.popupretrytimer);
                this.popupretrytimer = null;
            }
            if (!this.sogpopups) {return}
            for (let popup of this.sogpopups) {
                try {
                    if (popup && !popup.closed) {popup.close()}
                } catch (_) {}
            }
            this.sogpopups = [];
            if (this.sogs) {
                for (let s of this.sogs) {
                    s.popupwindow = null;
                }
            }
        }

        initpopupwindows() {
            this.closepopupwindows();
            if (!this.sogs || !this.sogs.length) {
                return false;
            }
            this.usepopupmode = true;
            this.ensurepopupwindows();
            this.syncpopupwindows(true);
            return !!this.sogpopups.length;
        }

        schedulepopupretry(delayms = popupretrydelayms) {
            if (this.popupretrytimer || !this.usepopupmode) {
                return;
            }
            this.popupretrytimer = setTimeout(() => {
                this.popupretrytimer = null;
                this.ensurepopupwindows();
            }, Math.max(100, delayms));
        }

        markpopupfailed(s) {
            if (!s) {
                return;
            }
            s.popupwindow = null;
            s.popupfailures = (s.popupfailures || 0) + 1;
            if (s.popupfailures >= popuprretrymaxattempts) {
                s.popupnextretryat = Number.POSITIVE_INFINITY;
                return;
            }
            const backoff = popupretrydelayms * Math.pow(1.5, Math.max(0, s.popupfailures - 1));
            s.popupnextretryat = Date.now() + backoff;
        }

        ensurepopupwindows() {
            if (!this.usepopupmode || !this.sogs) {
                return;
            }
            const popups = [];
            const now = Date.now();
            let shouldretry = false;
            let nextretryin = Number.POSITIVE_INFINITY;
            for (let i = 0; i < this.sogs.length; ++i) {
                const s = this.sogs[i];
                let popup = s.popupwindow;
                if (!popup || popup.closed) {
                    const nextretryat = s.popupnextretryat || 0;
                    if (nextretryat === Number.POSITIVE_INFINITY) {
                        popup = null;
                    } else if (nextretryat > now) {
                        shouldretry = true;
                        nextretryin = Math.min(nextretryin, nextretryat - now);
                        popup = null;
                    } else {
                        popup = this.createsogpopup(s, i);
                        if (!popup) {
                            this.markpopupfailed(s);
                            const retryat = s.popupnextretryat || 0;
                            if (retryat !== Number.POSITIVE_INFINITY) {
                                shouldretry = true;
                                nextretryin = Math.min(nextretryin, Math.max(100, retryat - now));
                            }
                        } else {
                            s.popupwindow = popup;
                            s.popupfailures = 0;
                            s.popupnextretryat = 0;
                        }
                    }
                }
                if (popup && !popup.closed) {
                    popups.push(popup);
                }
            }
            this.sogpopups = popups;
            if (shouldretry) {
                this.schedulepopupretry(nextretryin);
            }
        }

        syncpopupwindows(forceResize) {
            if (!this.usepopupmode || !this.sogs) {
                return;
            }
            for (let i = 0; i < this.sogs.length; ++i) {
                const s = this.sogs[i];
                const popup = s.popupwindow;
                if (!popup || popup.closed) {
                    if ((s.popupnextretryat || 0) !== Number.POSITIVE_INFINITY) {
                        this.schedulepopupretry();
                    }
                    continue;
                }
                const pos = this.getpopuppositionforsog(s);
                const width = Math.max(1, Math.round(s.sizew * popupsizefactor));
                const height = Math.max(1, Math.round(s.sizeh * popupsizefactor));
                try {
                    if (forceResize) {
                        popup.resizeTo(width, height);
                    }
                    popup.moveTo(pos.x, pos.y);
                    const unexpectedlylarge = popup.outerWidth > (screen.availWidth * 0.7) &&
                        popup.outerHeight > (screen.availHeight * 0.7);
                    if (unexpectedlylarge) {
                        popup.close();
                        this.markpopupfailed(s);
                        if ((s.popupnextretryat || 0) !== Number.POSITIVE_INFINITY) {
                            this.schedulepopupretry();
                        }
                        continue;
                    }
                } catch (_) {
                    try {popup.close()} catch (_) {}
                    this.markpopupfailed(s);
                    if ((s.popupnextretryat || 0) !== Number.POSITIVE_INFINITY) {
                        this.schedulepopupretry();
                    }
                    continue;
                }
            }
        }

        requestpopupmode() {
            if (!isdesktopdevice()) {
                return false;
            }
            if (!this.popuppermissionchecked) {
                this.popuppermissionchecked = true;
                const probe = window.open(
                    "", `soggypopupprobe`,
                    "popup=yes,width=120,height=80,left=0,top=0,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no,status=no"
                );
                if (!probe || probe === window) {
                    this.usepopupmode = false;
                    return false;
                }
                try {
                    probe.document.title = "sog";
                    probe.document.body.innerHTML = "";
                    probe.focus();
                    probe.close();
                } catch (_) {}
            }
            return this.initpopupwindows();
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
            if (isdesktopdevice()) {
                if (this.usepopupmode) {
                    menuchoice("disable popups", () => {
                        this.usepopupmode = false;
                        this.closepopupwindows();
                    });
                } else {
                    menuchoice("turn them into popups (buggy)", () => {
                        this.requestpopupmode();
                    });
                }
            }

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
            this.closepopupwindows();
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