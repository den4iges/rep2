const fastify = require('fastify')({
    logger: {
        transport: {
            target: 'pino-pretty'
        }
    }
});
const path = require('path');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const fs = require('fs').promises;
const argon2 = require('argon2');
const handlebars = require('handlebars');

// Register Handlebars helper
handlebars.registerHelper('multiply', function(a, b) {
    return (parseFloat(a) * parseFloat(b)).toFixed(2);
});

// Register plugins in correct order
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public')
});

fastify.register(require('@fastify/cookie'));

fastify.register(require('@fastify/session'), {
    cookieName: 'sessionId',
    secret: 'sweet-shop-secret-change-this-in-production',
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true
    },
    expires: 1800000
});

fastify.register(require('@fastify/formbody'));

fastify.register(require('@fastify/view'), {
    engine: {
        handlebars: require('handlebars')
    },
    root: path.join(__dirname, 'views'),
    layout: 'layouts/main',
    viewExt: 'hbs'
});

// XML helper functions
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ''
});

const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: ''
});

const readXMLFile = async (filename) => {
    const data = await fs.readFile(filename, 'utf-8');
    return parser.parse(data);
};

const writeXMLFile = async (filename, data) => {
    const xml = builder.build(data);
    await fs.writeFile(filename, xml);
};

// Cart helper functions
async function loadUserCart(userId) {
    try {
        const cartsData = await readXMLFile('data/carts.xml');
        if (!cartsData.carts.cartList) {
            return [];
        }

        // Convert to array if single cart
        const carts = Array.isArray(cartsData.carts.cartList.cart) 
            ? cartsData.carts.cartList.cart 
            : cartsData.carts.cartList.cart ? [cartsData.carts.cartList.cart] : [];

        const userCart = carts.find(cart => cart.userId === userId);
        if (!userCart || !userCart.items) {
            return [];
        }

        // Convert to array if single item
        return Array.isArray(userCart.items.item) ? userCart.items.item : [userCart.items.item];
    } catch (error) {
        console.error('Error loading cart:', error);
        return [];
    }
}

async function saveUserCart(userId, cartItems) {
    try {
        const cartsData = await readXMLFile('data/carts.xml');
        if (!cartsData.carts.cartList) {
            cartsData.carts.cartList = { cart: [] };
        } else if (!cartsData.carts.cartList.cart) {
            cartsData.carts.cartList.cart = [];
        }

        // Convert to array if single cart
        if (!Array.isArray(cartsData.carts.cartList.cart)) {
            cartsData.carts.cartList.cart = cartsData.carts.cartList.cart ? [cartsData.carts.cartList.cart] : [];
        }

        // Find user's cart
        let userCart = cartsData.carts.cartList.cart.find(cart => cart.userId === userId);
        
        if (!userCart) {
            // Create new cart for user
            userCart = {
                userId: userId,
                items: {
                    item: cartItems
                }
            };
            cartsData.carts.cartList.cart.push(userCart);
        } else {
            // Update existing cart
            userCart.items = {
                item: cartItems
            };
        }

        await writeXMLFile('data/carts.xml', cartsData);
        return true;
    } catch (error) {
        console.error('Error saving cart:', error);
        return false;
    }
}

// Authentication decorator
fastify.decorate('authenticate', async (request, reply) => {
    if (!request.session.user) {
        return reply.redirect('/login');
    }
    
    // Load cart from storage if not in session
    if (!request.session.cart) {
        request.session.cart = await loadUserCart(request.session.user.id);
    }
});

// Hook to add common template variables
fastify.addHook('preHandler', (request, reply, done) => {
    reply.locals = {
        user: request.session.user || null,
        cart: request.session.cart || []
    };
    done();
});

// Routes
fastify.get('/', async (request, reply) => {
    try {
        const productsData = await readXMLFile('data/products.xml');
        const categories = productsData.products.category.map(cat => ({
            name: cat.name,
            product: cat.product.map(p => ({
                id: p.id,
                name: p.n,
                description: p.description,
                price: p.price,
                image: p.image
            }))
        }));
        return reply.view('index', { 
            user: request.session.user,
            products: categories
        });
    } catch (error) {
        return reply.view('index', { 
            user: request.session.user,
            products: []
        });
    }
});

fastify.get('/login', async (request, reply) => {
    if (request.session.user) {
        return reply.redirect('/');
    }
    return reply.view('login');
});

fastify.get('/register', async (request, reply) => {
    if (request.session.user) {
        return reply.redirect('/');
    }
    return reply.view('register');
});

fastify.post('/login', async (request, reply) => {
    try {
        const { username, password } = request.body;
        
        if (!username || !password) {
            reply.code(400);
            return { success: false, message: 'Username and password are required' };
        }

        const usersData = await readXMLFile('data/users.xml');
        
        if (!usersData.users.userList || !usersData.users.userList.user) {
            reply.code(401);
            return { success: false, message: 'Invalid username or password' };
        }

        const users = Array.isArray(usersData.users.userList.user) 
            ? usersData.users.userList.user 
            : [usersData.users.userList.user];
        
        const user = users.find(u => u.username === username);
        if (!user) {
            reply.code(401);
            return { success: false, message: 'Invalid username or password' };
        }

        const validPassword = await argon2.verify(user.password, password);
        if (!validPassword) {
            reply.code(401);
            return { success: false, message: 'Invalid username or password' };
        }

        request.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            roleId: user.roleId
        };

        // Load user's cart from storage
        request.session.cart = await loadUserCart(user.id);

        return { success: true, message: 'Login successful' };
    } catch (error) {
        request.log.error(error);
        reply.code(500);
        return { success: false, message: 'An error occurred during login' };
    }
});

fastify.post('/register', async (request, reply) => {
    try {
        const { username, password, email, firstName, lastName } = request.body;
        
        if (!username || !password || !email || !firstName || !lastName) {
            reply.code(400);
            return { success: false, message: 'All fields are required' };
        }

        const usersData = await readXMLFile('data/users.xml');
        
        // Check if userList exists, if not create it
        if (!usersData.users.userList) {
            usersData.users.userList = { user: [] };
        } else if (!usersData.users.userList.user) {
            usersData.users.userList.user = [];
        }

        // Convert to array if single user
        if (!Array.isArray(usersData.users.userList.user)) {
            usersData.users.userList.user = [usersData.users.userList.user].filter(Boolean);
        }
        
        const userExists = usersData.users.userList.user.some(u => u.username === username);
        if (userExists) {
            reply.code(400);
            return { success: false, message: 'Username already exists' };
        }

        const hashedPassword = await argon2.hash(password);
        const newUser = {
            id: (usersData.users.userList.user.length + 1).toString(),
            username,
            password: hashedPassword,
            email,
            roleId: '2',
            firstName,
            lastName,
            created: new Date().toISOString()
        };

        usersData.users.userList.user.push(newUser);
        await writeXMLFile('data/users.xml', usersData);

        return { success: true, message: 'Registration successful' };
    } catch (error) {
        request.log.error(error);
        reply.code(500);
        return { success: false, message: 'An error occurred during registration' };
    }
});

fastify.get('/logout', async (request, reply) => {
    if (request.session.user) {
        // Save cart before destroying session
        await saveUserCart(request.session.user.id, request.session.cart || []);
    }
    request.session.destroy();
    return reply.redirect('/');
});

// Catalog route
fastify.get('/catalog', async (request, reply) => {
    try {
        const productsData = await readXMLFile('data/products.xml');
        const categories = productsData.products.category.map(cat => ({
            name: cat.name,
            product: cat.product.map(p => ({
                id: p.id,
                name: p.n,
                description: p.description,
                price: p.price,
                image: p.image,
                stock: p.stock
            }))
        }));
        return reply.view('catalog', { 
            user: request.session.user,
            products: categories
        });
    } catch (error) {
        request.log.error(error);
        return reply.view('catalog', { 
            user: request.session.user,
            products: [],
            error: 'Failed to load products'
        });
    }
});

fastify.get('/cart', { preHandler: fastify.authenticate }, async (request, reply) => {
    const cart = request.session.cart || [];
    const cartTotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    
    return reply.view('cart', { 
        user: request.session.user,
        cart: cart,
        cartTotal: cartTotal.toFixed(2)
    });
});

fastify.post('/cart/add/:productId', { preHandler: fastify.authenticate }, async (request, reply) => {
    const productId = request.params.productId;
    const quantity = parseInt(request.body.quantity) || 1;
    
    if (!request.session.cart) {
        request.session.cart = [];
    }

    const productsData = await readXMLFile('data/products.xml');
    let product = null;

    // Find product in XML
    productsData.products.category.forEach(category => {
        const found = category.product.find(p => p.id === productId);
        if (found) {
            product = {
                id: found.id,
                name: found.n,
                price: found.price,
                image: found.image,
                stock: found.stock
            };
        }
    });

    if (product) {
        const cartItem = request.session.cart.find(item => item.id === productId);
        if (cartItem) {
            cartItem.quantity += quantity;
            cartItem.quantity = Math.min(cartItem.quantity, product.stock);
        } else {
            request.session.cart.push({
                id: productId,
                name: product.name,
                price: parseFloat(product.price),
                image: product.image,
                quantity: Math.min(quantity, product.stock)
            });
        }

        // Save cart to storage
        await saveUserCart(request.session.user.id, request.session.cart);
        return { success: true, cartCount: request.session.cart.length };
    }
    
    reply.code(404);
    return { success: false, message: 'Product not found' };
});

fastify.post('/cart/update/:productId', { preHandler: fastify.authenticate }, async (request, reply) => {
    const productId = request.params.productId;
    const quantity = parseInt(request.body.quantity);

    if (!request.session.cart) {
        reply.code(404);
        return { success: false, message: 'Cart is empty' };
    }

    const cartItem = request.session.cart.find(item => item.id === productId);
    if (cartItem) {
        if (quantity > 0 && quantity <= 10) {
            cartItem.quantity = quantity;
            // Save cart to storage
            await saveUserCart(request.session.user.id, request.session.cart);
            return { success: true };
        } else {
            reply.code(400);
            return { success: false, message: 'Invalid quantity' };
        }
    }

    reply.code(404);
    return { success: false, message: 'Product not found in cart' };
});

fastify.post('/cart/remove/:productId', { preHandler: fastify.authenticate }, async (request, reply) => {
    const productId = request.params.productId;

    if (!request.session.cart) {
        reply.code(404);
        return { success: false, message: 'Cart is empty' };
    }

    const itemIndex = request.session.cart.findIndex(item => item.id === productId);
    if (itemIndex !== -1) {
        request.session.cart.splice(itemIndex, 1);
        // Save cart to storage
        await saveUserCart(request.session.user.id, request.session.cart);
        return { success: true };
    }

    reply.code(404);
    return { success: false, message: 'Product not found in cart' };
});

// Profile routes
fastify.get('/profile', {
    onRequest: [fastify.authenticate]
}, async (request, reply) => {
    try {
        const usersData = await readXMLFile('data/users.xml');
        if (!usersData.users.userList || !usersData.users.userList.user) {
            throw new Error('User not found');
        }

        const users = Array.isArray(usersData.users.userList.user) 
            ? usersData.users.userList.user 
            : [usersData.users.userList.user];
        const currentUser = users.find(u => u.id === request.session.user.id);

        if (!currentUser) {
            throw new Error('User not found');
        }

        // Get orders if they exist
        let orders = [];
        try {
            const ordersData = await readXMLFile('data/orders.xml');
            if (ordersData.orders && ordersData.orders.order) {
                orders = Array.isArray(ordersData.orders.order) 
                    ? ordersData.orders.order 
                    : [ordersData.orders.order];
                orders = orders.filter(order => order.userId === request.session.user.id);
            }
        } catch (error) {
            // Orders file might not exist yet
            console.log('No orders found');
        }

        return reply.view('profile', { 
            user: currentUser,
            orders: orders
        });
    } catch (error) {
        request.log.error('Error loading profile:', error);
        return reply.view('profile', {
            errorMessage: 'Error loading profile: ' + error.message
        });
    }
});

fastify.post('/profile/update', {
    onRequest: [fastify.authenticate]
}, async (request, reply) => {
    try {
        const { email, currentPassword, newPassword, confirmPassword } = request.body;
        const usersData = await readXMLFile('data/users.xml');
        if (!usersData.users.userList || !usersData.users.userList.user) {
            throw new Error('User not found');
        }

        const users = Array.isArray(usersData.users.userList.user) 
            ? usersData.users.userList.user 
            : [usersData.users.userList.user];
        const userIndex = users.findIndex(u => u.id === request.session.user.id);

        if (userIndex === -1) {
            return reply.view('profile', {
                errorMessage: 'User not found'
            });
        }

        // Update email
        users[userIndex].email = email;

        // Handle password update if provided
        if (newPassword) {
            if (!currentPassword) {
                return reply.view('profile', {
                    errorMessage: 'Current password is required to change password',
                    user: users[userIndex]
                });
            }

            if (newPassword !== confirmPassword) {
                return reply.view('profile', {
                    errorMessage: 'New passwords do not match',
                    user: users[userIndex]
                });
            }

            // Verify current password
            const isValidPassword = await argon2.verify(users[userIndex].password, currentPassword);
            if (!isValidPassword) {
                return reply.view('profile', {
                    errorMessage: 'Current password is incorrect',
                    user: users[userIndex]
                });
            }

            // Hash and update new password
            users[userIndex].password = await argon2.hash(newPassword);
        }

        // Save updated user data
        await writeXMLFile('data/users.xml', usersData);

        // Update session user data
        request.session.user = {
            id: users[userIndex].id,
            username: users[userIndex].username,
            email: users[userIndex].email
        };

        return reply.view('profile', {
            user: users[userIndex],
            successMessage: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        return reply.view('profile', {
            errorMessage: 'Error updating profile: ' + error.message
        });
    }
});

// Product verification function
async function verifyProductSetup() {
    const IMAGES_DIR = path.join(__dirname, 'public', 'images', 'products');
    const PRODUCTS_XML_PATH = path.join(__dirname, 'data', 'products.xml');

    // Ensure directories exist
    try {
        await fs.access(path.dirname(PRODUCTS_XML_PATH));
    } catch {
        await fs.mkdir(path.dirname(PRODUCTS_XML_PATH), { recursive: true });
    }

    try {
        await fs.access(IMAGES_DIR);
    } catch {
        await fs.mkdir(IMAGES_DIR, { recursive: true });
    }

    // Verify products.xml exists and has valid structure
    try {
        const productsData = await readXMLFile('data/products.xml');
        if (!productsData.products || !productsData.products.category) {
            throw new Error('Invalid products.xml structure');
        }

        // Convert to array if single category
        const categories = Array.isArray(productsData.products.category) 
            ? productsData.products.category 
            : [productsData.products.category];

        // Verify images exist
        const missingImages = [];
        const existingImages = new Set();

        try {
            const files = await fs.readdir(IMAGES_DIR);
            files.forEach(file => existingImages.add(file));
        } catch (error) {
            console.error('Error reading images directory:', error.message);
        }

        categories.forEach(category => {
            const products = Array.isArray(category.product) ? category.product : [category.product];
            products.forEach(product => {
                if (!existingImages.has(product.image)) {
                    missingImages.push({
                        productName: product.n,
                        imageName: product.image
                    });
                }
            });
        });

        if (missingImages.length > 0) {
            console.log('\nWarning: Missing product images:');
            missingImages.forEach(({ productName, imageName }) => {
                console.log(`- ${productName}: missing image '${imageName}'`);
            });
            console.log('\nPlease add the missing images to:', IMAGES_DIR);
        }

        return true;
    } catch (error) {
        console.error('Error verifying products:', error.message);
        return false;
    }
}

// Start server
const start = async () => {
    try {
        // Verify product setup before starting server
        console.log('Verifying product setup...');
        const setupValid = await verifyProductSetup();
        if (!setupValid) {
            console.error('Product setup verification failed. Please check the errors above.');
            process.exit(1);
        }

        const port = process.env.PORT || 3004;
        await fastify.listen({ port });
        console.log('\n=== Sweet Shop Server Started ===');
        console.log(`Server is running!`);
        console.log(`Access the site at: http://localhost:${port}`);
        console.log(`Press Ctrl+C to stop the server`);
        console.log(`================================\n`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();