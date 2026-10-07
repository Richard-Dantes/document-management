document.addEventListener('DOMContentLoaded', () => {
    const roleTabs = document.querySelectorAll('.role-tab');
    const roleInput = document.getElementById('roleInput');
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const usernameError = document.getElementById('usernameError');
    const passwordError = document.getElementById('passwordError');
    const passwordToggle = document.getElementById('passwordToggle');
    const signinBtn = document.getElementById('signinBtn');
    const roleIndicator = document.getElementById('roleIndicator');
    const rememberMe = document.getElementById('rememberMe');
    let currentRole = 'system_admin';

    const redirectMap = {
        system_admin: 'admin-dashboard.html',
        hr_admin: 'admin-dashboard.html',
        hr_staff: 'employee-dashboard.html',
        admin: 'admin-dashboard.html',
        employee: 'employee-dashboard.html',
    };

    const roleLabels = {
        system_admin: 'System Administrator',
        hr_admin: 'HR Administrator',
        hr_staff: 'HR Staff',
        admin: 'HR Administrator',
        employee: 'HR Staff',
    };

    // Redirect if already logged in
    if (SecureHRStorage.isLoggedIn()) {
        const role = SecureHRStorage.getSessionRole();
        if (role && redirectMap[role]) {
            window.location.href = redirectMap[role];
            return;
        }
    }

    // Display redirect message if set
    const redirectMsg = SecureHRSession.getRedirectMessage();
    if (redirectMsg) {
        showToast(redirectMsg, 'info');
    }

    // Role switching
    roleTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            roleTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            currentRole = tab.dataset.role;
            roleInput.value = currentRole;

            const roleName = roleLabels[currentRole] || 'System Administrator';
            roleIndicator.innerHTML = `Signing in as <span>${roleName}</span>`;

            usernameInput.classList.remove('error');
            passwordInput.classList.remove('error');
            usernameError.classList.remove('show');
            passwordError.classList.remove('show');
            passwordInput.value = '';

            usernameInput.placeholder = 'Enter email or employee ID';
        });
    });

    // Password visibility toggle
    passwordToggle.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;

        const eyeOpen = passwordToggle.querySelector('.eye-open');
        const eyeClosed = passwordToggle.querySelector('.eye-closed');

        if (type === 'text') {
            eyeOpen.style.display = 'none';
            eyeClosed.style.display = 'block';
        } else {
            eyeOpen.style.display = 'block';
            eyeClosed.style.display = 'none';
        }
    });

    // Real-time input validation
    usernameInput.addEventListener('input', () => {
        if (usernameInput.value.trim()) {
            usernameInput.classList.remove('error');
            usernameError.classList.remove('show');
        }
    });

    passwordInput.addEventListener('input', () => {
        if (passwordInput.value.trim()) {
            passwordInput.classList.remove('error');
            passwordError.classList.remove('show');
        }
    });

    // Form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        let isValid = true;

        if (!usernameInput.value.trim()) {
            usernameInput.classList.add('error');
            usernameError.classList.add('show');
            usernameError.textContent = 'Username is required';
            isValid = false;
        }

        if (!passwordInput.value.trim()) {
            passwordInput.classList.add('error');
            passwordError.classList.add('show');
            passwordError.textContent = 'Password is required';
            isValid = false;
        }

        if (!isValid) {
            loginForm.style.animation = 'none';
            void loginForm.offsetHeight;
            loginForm.style.animation = 'shake 0.4s ease';
            return;
        }

        signinBtn.classList.add('loading');

        const inputUser = usernameInput.value.trim();
        const inputPass = passwordInput.value.trim();

        try {
            const result = await SecureHRStorage.apiAuthenticate(inputUser, inputPass, currentRole);

            if (result.success) {
                if (rememberMe && rememberMe.checked) {
                    localStorage.setItem('securehr_remember_user', inputUser);
                    localStorage.setItem('securehr_remember_role', currentRole);
                } else {
                    localStorage.removeItem('securehr_remember_user');
                    localStorage.removeItem('securehr_remember_role');
                }
                showToast('Login successful! Redirecting...', 'success');
                setTimeout(() => {
                    const destination = redirectMap[result.user?.role] || redirectMap[currentRole] || 'admin-dashboard.html';
                    window.location.href = destination;
                }, 800);
            } else {
                signinBtn.classList.remove('loading');
                showToast(result.message || 'Invalid username or password. Please try again.', 'error');

                usernameInput.classList.add('error');
                passwordInput.classList.add('error');
                usernameError.textContent = result.message || 'Invalid credentials';
                usernameError.classList.add('show');
            }
        } catch (err) {
            signinBtn.classList.remove('loading');
            showToast('Unable to connect to server.', 'error');
        }
    });

    function clearErrors() {
        usernameInput.classList.remove('error');
        passwordInput.classList.remove('error');
        usernameError.classList.remove('show');
        passwordError.classList.remove('show');
        usernameInput.value = '';
        passwordInput.value = '';
    }

    function showToast(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '<path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" fill="#38A169"/>',
            error: '<path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" fill="#E53E3E"/>',
            info: '<path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2a1 1 0 002 0V7zm0 6a1 1 0 10-2 0 1 1 0 002 0z" fill="#3B82F6"/>',
        };

        toast.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                ${icons[type] || icons.info}
            </svg>
            <span></span>
        `;
        toast.querySelector('span').textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-8px); }
            40% { transform: translateX(8px); }
            60% { transform: translateX(-5px); }
            80% { transform: translateX(5px); }
        }
    `;
    document.head.appendChild(shakeStyle);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') {
            loginForm.dispatchEvent(new Event('submit'));
        }
    });

    const rememberedUser = localStorage.getItem('securehr_remember_user');
    const rememberedRole = localStorage.getItem('securehr_remember_role');
    if (rememberedUser && usernameInput) {
        usernameInput.value = rememberedUser;
        if (rememberMe) rememberMe.checked = true;
    }
    if (rememberedRole) {
        const tab = document.querySelector('.role-tab[data-role="' + rememberedRole + '"]');
        if (tab) tab.click();
        if (rememberedUser) usernameInput.value = rememberedUser;
    }

    // Quick Demo Accounts button listeners
    document.querySelectorAll('.demo-role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const role = btn.dataset.role;
            const user = btn.dataset.user;
            const pass = btn.dataset.pass;

            const tab = document.querySelector(`.role-tab[data-role="${role}"]`);
            if (tab) tab.click();

            if (usernameInput) usernameInput.value = user;
            if (passwordInput) passwordInput.value = pass;

            usernameInput.classList.remove('error');
            passwordInput.classList.remove('error');
            usernameError.classList.remove('show');
            passwordError.classList.remove('show');

            showToast(`Loaded ${roleLabels[role] || role} credentials! Click 'Sign In' or press Enter.`, 'info');
        });
    });
});
