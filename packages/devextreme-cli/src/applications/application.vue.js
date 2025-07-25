const path = require('path');
const fs = require('fs');
const getLayoutInfo = require('../utility/prompts/layout');
const templateCreator = require('../utility/template-creator');
const packageManager = require('../utility/package-manager');
const packageJsonUtils = require('../utility/package-json-utils');
const runCommand = require('../utility/run-command');
const insertItemToArray = require('../utility/file-content').insertItemToArray;
const moduleUtils = require('../utility/module');
const stringUtils = require('../utility/string');
const latestVersions = require('../utility/latest-versions');
const { depsVersionTagOptionName, extractDepsVersionTag } = require('../utility/extract-deps-version-tag');
const defaultStyles = [
    'devextreme/dist/css/dx.light.css'
];

const preparePackageJsonForTemplate = (appPath, appName) => {
    const dependencies = [
        { name: 'sass-embedded', version: '^1.85.1' },
        { name: 'vue-router', version: '^3.0.1' },
        { name: 'devextreme-cli', version: latestVersions['devextreme-cli'], dev: true }
    ];

    const nameDepends = dependencies.map(d => d.name);
    const indexVueRouter = nameDepends.indexOf('vue-router');

    dependencies[indexVueRouter].version = '^4.0.1';

    const scripts = [
        { name: 'build-themes', value: 'devextreme build' },
        { name: 'postinstall', value: 'npm run build-themes' }
    ];

    packageJsonUtils.addDependencies(appPath, dependencies);
    packageJsonUtils.updateScripts(appPath, scripts);
    packageJsonUtils.updateName(appPath, appName);
};

async function createVueApp(name, depsVersionTag) {
    const argList = ['create', `vue@${depsVersionTag ? depsVersionTag : latestVersions['create-vue']}`, name, '--registry', 'https://registry.npmjs.org/', '--', '--eslint', '--default', '--bare'];
    return runCommand('npm', argList);
}

const bumpVue = (appPath, versionTag) => {
    const dependencies = [
        { name: 'vue', version: versionTag },
        { name: 'vue-router', version: versionTag },
    ];

    packageJsonUtils.addDependencies(appPath, dependencies);
};

const create = async(appName, options) => {
    const layout = await getLayoutInfo(options.layout);
    const depsVersionTag = extractDepsVersionTag(options);

    const templateOptions = {
        project: stringUtils.humanize(appName),
        layout: layout,
        [depsVersionTagOptionName]: options[depsVersionTagOptionName]
    };

    await createVueApp(appName, depsVersionTag);

    const appPath = path.join(process.cwd(), appName);

    if(depsVersionTag) {
        bumpVue(appPath, depsVersionTag);
    }

    modifyIndexHtml(appPath, templateOptions.project);
    addTemplate(appPath, appName, templateOptions);
};

const modifyIndexHtml = (appPath, appName) => {
    const indexHtmlPath = path.join(appPath, 'index.html');
    let htmlContent = fs.readFileSync(indexHtmlPath).toString();

    htmlContent = htmlContent.replace(/<title>(\w+\s*)+<\/title>/, `<title>${appName}<\/title>`);
    htmlContent = htmlContent.replace('<body>', '<body class="dx-viewport">');
    fs.writeFileSync(indexHtmlPath, htmlContent);
};

const getCorrectPath = (extension, pathToApp) => {
    return pathToApp;
};

const addTemplate = (appPath, appName, templateOptions) => {
    const applicationTemplatePath = path.join(templateCreator.getTempaltePath('vue-v3'), 'application');
    const styles = [
        './themes/generated/theme.additional.css',
        './themes/generated/theme.additional.dark.css',
        './themes/generated/theme.base.css',
        './themes/generated/theme.base.dark.css',
        'devextreme/dist/css/dx.common.css'
    ];

    templateCreator.moveTemplateFilesToProject(applicationTemplatePath, appPath, templateOptions, getCorrectPath);
    if(!templateOptions.empty) {
        addSamplePages(appPath, templateOptions);
    }
    preparePackageJsonForTemplate(appPath, appName);
    install({}, appPath, styles);
};

const install = (options, appPath, styles) => {
    appPath = appPath ? appPath : process.cwd();
    addStylesToApp(appPath, styles || defaultStyles);
    packageJsonUtils.addDevextreme(appPath, options.dxversion, 'vue');

    packageManager.runInstall({ cwd: appPath });
};

const addStylesToApp = (appPath, styles) => {
    const mainModulePath = path.join(appPath, 'src', 'main.js');

    styles.forEach(style => {
        moduleUtils.insertImport(mainModulePath, style);
    });
};

const addSamplePages = (appPath) => {
    const samplePageTemplatePath = path.join(templateCreator.getTempaltePath('vue-v3'), 'sample-pages');
    const pagesPath = createPathToPage(appPath);
    templateCreator.moveTemplateFilesToProject(samplePageTemplatePath, pagesPath, {}, getCorrectPath);
};

const getComponentPageName = (viewName) => {
    return `${stringUtils.classify(viewName)}`;
};

const getVueRoute = (viewName, componentName, pagePath) => {
    const path = `path: "/${pagePath}"`;
    const name = `name: "${stringUtils.dasherize(viewName)}"`;

    const metaPart = 'meta: {\n        requiresAuth: true,\n        layout: defaultLayout\n      }';

    const componentPart = `component: ${componentName}`;

    const commonPart = `\n    {\n      ${path},\n      ${name},\n      ${metaPart},\n      ${componentPart}\n    }`;

    return commonPart;
};

const getNavigationData = (viewName, componentName, icon) => {
    const pagePath = stringUtils.dasherize(viewName);
    return {
        route: getVueRoute(viewName, componentName, pagePath),
        navigation: `\n  {\n    text: \'${stringUtils.humanize(viewName)}\',\n    path: \'/${pagePath}\',\n    icon: \'${icon}\'\n  }`
    };
};

const createPathToPage = (appPath) => {
    const pagesPath = path.join(appPath, 'src', 'views');

    if(!fs.existsSync(pagesPath)) {
        fs.mkdirSync(pagesPath);
    }

    return pagesPath;
};

const addView = (pageName, options) => {
    const pageTemplatePath = path.join(templateCreator.getTempaltePath('vue-v3'), 'page');

    const componentName = getComponentPageName(pageName);
    const pathToPage = createPathToPage(process.cwd());
    const routingModulePath = path.join(process.cwd(), 'src', 'router.js');
    const navigationModulePath = path.join(process.cwd(), 'src', 'app-navigation.js');
    const navigationData = getNavigationData(pageName, componentName, options && options.icon || 'folder');
    const getCorrectExtension = (fileExtension) => fileExtension;
    templateCreator.addPageToApp(pageName, pathToPage, pageTemplatePath, getCorrectExtension);
    moduleUtils.insertImport(routingModulePath, `./views/${pageName}.vue`, componentName, true);
    insertItemToArray(routingModulePath, navigationData.route);
    insertItemToArray(navigationModulePath, navigationData.navigation);
};

module.exports = {
    install,
    create,
    addTemplate,
    addView
};
