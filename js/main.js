// main.js - Archivo de lógica central

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. SMART NAVBAR (Ocultar al bajar, mostrar al subir) ---
    let lastScrollTop = 0;
    const navbar = document.getElementById('mainNavbar');
    
    if (navbar) {
        window.addEventListener('scroll', () => {
            let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            if (scrollTop > 100) {
                if (scrollTop > lastScrollTop) {
                    navbar.classList.add('hidden-nav');
                } else {
                    navbar.classList.remove('hidden-nav');
                }
            } else {
                navbar.classList.remove('hidden-nav');
            }
            lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
        });
    }

    // --- 2. ANIMACIONES DE SCROLL (Efecto aparecer hacia arriba) ---
    const reveals = document.querySelectorAll('.reveal');
    
    const revealOptions = {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    };

    const revealOnScroll = new IntersectionObserver(function(entries, observer) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            } else {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, revealOptions);

    reveals.forEach(reveal => {
        revealOnScroll.observe(reveal);
    });

    // --- 3. FONDO DE BURBUJAS ---
    const container = document.getElementById('bubbleContainer');
    if (container) {
        const cantidad = 50; 
        for (let i = 0; i < cantidad; i++) {
            const bubble = document.createElement('div');
            bubble.classList.add('bubble');
            
            const size = Math.random() * 17 + 8;
            bubble.style.width = `${size}px`;
            bubble.style.height = `${size}px`;
            bubble.style.left = `${Math.random() * 100}%`;
            bubble.style.animationDuration = `${Math.random() * 15 + 8}s`;
            bubble.style.animationDelay = `${Math.random() * 10}s`;

            container.appendChild(bubble);
        }
    }
    
});