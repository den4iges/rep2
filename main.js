$(document).ready(function() {
    // Handle mobile navigation toggle
    $('.mobile-nav-toggle').on('click', function() {
        $('.nav-links').toggleClass('active');
    });

    // Handle quantity input validation
    $('.quantity-input').on('input', function() {
        const value = parseInt($(this).val());
        const min = parseInt($(this).attr('min'));
        const max = parseInt($(this).attr('max'));

        if (value < min) $(this).val(min);
        if (value > max) $(this).val(max);
    });

    // Handle add to cart animation
    $('.btn-add-cart').on('click', function() {
        const button = $(this);
        button.addClass('adding');
        
        setTimeout(() => {
            button.removeClass('adding');
        }, 1000);
    });

    // Handle flash messages
    const flashMessages = $('.alert');
    if (flashMessages.length > 0) {
        setTimeout(() => {
            flashMessages.fadeOut();
        }, 5000);
    }

    // Handle form validation
    $('form').on('submit', function() {
        const requiredFields = $(this).find('[required]');
        let isValid = true;

        requiredFields.each(function() {
            if (!$(this).val()) {
                isValid = false;
                $(this).addClass('error');
            } else {
                $(this).removeClass('error');
            }
        });

        return isValid;
    });

    // Handle password strength indicator
    $('#password').on('input', function() {
        const password = $(this).val();
        const strength = checkPasswordStrength(password);
        updatePasswordStrengthIndicator(strength);
    });

    // Handle dynamic search filtering
    $('#search-input').on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        
        $('.product-card').each(function() {
            const productName = $(this).find('h3').text().toLowerCase();
            const productDescription = $(this).find('.description').text().toLowerCase();
            
            if (productName.includes(searchTerm) || productDescription.includes(searchTerm)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });

    // Handle price range filtering
    $('#min-price, #max-price').on('change', function() {
        const minPrice = parseFloat($('#min-price').val()) || 0;
        const maxPrice = parseFloat($('#max-price').val()) || Infinity;

        $('.product-card').each(function() {
            const price = parseFloat($(this).find('.price').text().replace('$', ''));
            
            if (price >= minPrice && price <= maxPrice) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });

    // Handle category filtering
    $('input[name="category"]').on('change', function() {
        const selectedCategories = $('input[name="category"]:checked')
            .map(function() { return $(this).val(); })
            .get();

        if (selectedCategories.length === 0) {
            $('.product-card').show();
            return;
        }

        $('.product-card').each(function() {
            const category = $(this).data('category');
            if (selectedCategories.includes(category)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });
});

// Helper functions
function checkPasswordStrength(password) {
    let strength = 0;
    
    // Length check
    if (password.length >= 8) strength++;
    
    // Contains number
    if (/\d/.test(password)) strength++;
    
    // Contains lowercase
    if (/[a-z]/.test(password)) strength++;
    
    // Contains uppercase
    if (/[A-Z]/.test(password)) strength++;
    
    // Contains special character
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    return strength;
}

function updatePasswordStrengthIndicator(strength) {
    const indicator = $('.password-strength');
    indicator.removeClass('weak medium strong');
    
    if (strength <= 2) {
        indicator.addClass('weak').text('Weak');
    } else if (strength <= 4) {
        indicator.addClass('medium').text('Medium');
    } else {
        indicator.addClass('strong').text('Strong');
    }
}

// Handle scroll to top
$(window).scroll(function() {
    if ($(this).scrollTop() > 300) {
        $('#scroll-to-top').fadeIn();
    } else {
        $('#scroll-to-top').fadeOut();
    }
});

$('#scroll-to-top').click(function() {
    $('html, body').animate({scrollTop: 0}, 800);
    return false;
}); 