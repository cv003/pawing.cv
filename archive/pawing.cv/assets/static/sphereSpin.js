        const images = [];
        const frontImages = [];
        const sources = ['assets/images/sillysog.webp', 'assets/images/sillysog2.webp'];
        const numImages = 20;
        const radius = 200;
        const fov = 250;
        const sphereContainer = document.getElementById("sphere");
        const frontSphereContainer = document.getElementById("frontSphere");

        const zSimplicity = 25;

        for (let i = 0; i < numImages; i++) {
            const img = document.createElement('img');
            img.src = sources[Math.floor(Math.random() * sources.length)];
            img.className = 'image';

            sphereContainer.appendChild(img);
            images.push(img);

            const frontImg = img.cloneNode(false);
            frontSphereContainer.appendChild(frontImg);
            frontImages.push(frontImg);
        }

        let easingAngleX = 0;
        let easingAngleY = 0;

        let angleX = 0;
        let angleY = 0;

        let easingScaleMult = 1;
        let scaleMult = 1;

        function lerp(a, b, t) {
            return a + (b - a) * t;
        }

        let isMobile = false;
            
        if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)){
            isMobile = true
        }


        let start = 1;
        
        function animate(timeStamp) {
            
            const elapsed = timeStamp - start;
            start = timeStamp;

            const ease = Math.min(0.0025 * elapsed, 1)
            angleX = lerp(angleX, easingAngleX, ease);
            angleY = lerp(angleY, easingAngleY, ease);

            frontSphereContainer.style.zIndex = fov / zSimplicity;

            for (let rawi = 0; rawi < numImages*2; rawi ++) {
                let img = images[rawi];
                let i = rawi;
                let front = false;

                let othergroundImg = frontImages[rawi]

                if (rawi >= numImages) {
                    i = rawi - numImages;
                    img = frontImages[i];
                    front = true

                    othergroundImg = images[i]
                }
                const phi = Math.acos(1 - 2 * (i + 0.5) / numImages);
                const theta = Math.PI * (1 + 2.2360679775) * (i + 0.5);

                const thetaCos = Math.cos(theta);
                const thetaSin = Math.sin(theta)

                const phiCos = Math.cos(phi);
                const phiSin = Math.sin(phi);

                const angleYCos = Math.cos(angleY);
                const angleYSin = Math.sin(angleY);

                const angleXCos = Math.cos(angleX);
                const angleXSin = Math.sin(angleX);

                const x = radius * thetaCos * phiSin;
                const y = radius * thetaSin * phiSin;
                const z = radius * phiCos;

                const rotatedX = x * angleYCos - z * angleYSin;
                const rotatedZ = z * angleYCos + x * angleYSin;

                const finalX = rotatedX;
                const finalY = y * angleXCos - rotatedZ * angleXSin;
                const finalZ = rotatedZ * angleXCos + y * angleXSin;
                
                let display = true
                if (finalZ < (-fov)+3) {
                    display = false
                }

                let scale = fov / (fov + finalZ);
                scale *= 0.2;

                let opacity = (finalZ/ (fov * 0.5))+1;
                if (front) {
                    opacity = -finalZ / (fov * 0.5);
                    opacity += 0.5;
                }

                if (opacity <= 0) {
                    display = false
                }

                if (display) {
                    img.style.display = 'block';
                    img.style.transform = `translate(${finalX * scale}vw, ${finalY * scale}vh) scale(${scale*100*scaleMult}%)`;

                    let sort = front ? -finalZ : (-finalZ) - fov;
                    img.style.zIndex = Math.round(sort / zSimplicity);

                    img.style.opacity = Math.min(Math.max(opacity, 0), 1);

                    const isHover = e => e.parentElement.querySelector(':hover') === e;
                    
                    if (!front) {
                        if (isHover(img) && opacity > 0.8) {
                            img.className = "image hoveredImage"
                            othergroundImg.className = "image hoveredImage"
                        }
                        else
                        {
                            img.className = "image"
                            othergroundImg.className = "image"
                        }
                    }
                }
                else
                {
                    if (!front) {
                        img.className = "image"
                        othergroundImg.className = "image"
                    }

                    img.style.display = 'none';
                }
            };

            if (!isMobile) {
                requestAnimationFrame(animate);
            }
            
        }

        requestAnimationFrame(animate);

        document.addEventListener('mousemove', (event) => {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            const deltaX = (event.clientX - centerX) / centerX;
            const deltaY = (event.clientY - centerY) / centerY;

            easingAngleY = deltaX * Math.PI / -5;
            easingAngleX = deltaY * Math.PI / -5;
        });