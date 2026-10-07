const SecureHRSession = (() => {
    const LOGIN_PAGE = 'index.html';
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

    // Check if user is logged in with the required role
    function requireAuth(requiredRole) {
        if (!SecureHRStorage.isLoggedIn()) {
            redirectToLogin('Please sign in to continue.');
            return null;
        }

        // Check session timeout
        const loginTime = sessionStorage.getItem('securehr_loginTime');
        if (loginTime) {
            const elapsed = Date.now() - new Date(loginTime).getTime();
            if (elapsed > SESSION_TIMEOUT_MS) {
                SecureHRStorage.clearSession();
                redirectToLogin('Session expired. Please sign in again.');
                return null;
            }
        }

        // Check role
        const currentRole = SecureHRStorage.getSessionRole();
        const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        const isMatch = allowed.some(r => {
            if (r === currentRole) return true;
            if (r === 'admin' && (currentRole === 'system_admin' || currentRole === 'hr_admin')) return true;
            if (r === 'employee' && (currentRole === 'hr_staff' || currentRole === 'employee')) return true;
            if ((r === 'system_admin' || r === 'hr_admin') && currentRole === 'admin') return true;
            if (r === 'hr_staff' && currentRole === 'employee') return true;
            return false;
        });

        if (!isMatch) {
            if (currentRole === 'system_admin' || currentRole === 'hr_admin' || currentRole === 'admin') {
                window.location.href = 'admin-dashboard.html';
            } else if (currentRole === 'hr_staff' || currentRole === 'employee') {
                window.location.href = 'employee-dashboard.html';
            } else {
                redirectToLogin('Unauthorized access.');
            }
            return null;
        }

        const user = SecureHRStorage.getCurrentUser();
        if (!user) {
            redirectToLogin('Session data missing. Please sign in again.');
            return null;
        }

        // Keep session alive on activity
        sessionStorage.setItem('securehr_loginTime', new Date().toISOString());
        return user;
    }

    // Redirect to login page with message
    function redirectToLogin(message) {
        if (message) {
            sessionStorage.setItem('securehr_redirect_msg', message);
        }
        window.location.href = LOGIN_PAGE;
    }

    // Log out current user, clear session, and redirect
    async function logout(customMsg = 'You have been successfully signed out.') {
        const user = SecureHRStorage.getCurrentUser();
        const token = sessionStorage.getItem('securehr_token');

        if (user) {
            try {
                if (typeof SecureHRStorage.isHttpServer === 'function' && SecureHRStorage.isHttpServer()) {
                    await fetch('api/auth.php?action=logout', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': token ? 'Bearer ' + token : '',
                        },
                        body: JSON.stringify({ token: token }),
                    });
                }
            } catch (e) {
                console.warn('Logout notification error:', e);
            }

            SecureHRStorage.appendAuditLog({
                actor: user.firstName + ' ' + user.lastName,
                actorId: user.id,
                action: 'LOGOUT',
                target: '-',
                details: `${(user.role === 'system_admin' || user.role === 'hr_admin' || user.role === 'admin') ? 'Admin' : 'Employee'} logged out`,
            });
        }

        SecureHRStorage.clearSession();
        redirectToLogin(customMsg);
    }

    function getRedirectMessage() {
        const msg = sessionStorage.getItem('securehr_redirect_msg');
        if (msg) sessionStorage.removeItem('securehr_redirect_msg');
        return msg;
    }

    // Auto logout after inactivity
    function startInactivityTimer() {
        let timer;

        function resetTimer() {
            clearTimeout(timer);
            timer = setTimeout(() => {
                SecureHRStorage.clearSession();
                redirectToLogin('Session expired due to inactivity. Please sign in again.');
            }, SESSION_TIMEOUT_MS);
        }

        ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(event => {
            document.addEventListener(event, resetTimer, { passive: true });
        });

        resetTimer();
    }

    return {
        requireAuth,
        logout,
        redirectToLogin,
        getRedirectMessage,
        startInactivityTimer,
    };
})();
