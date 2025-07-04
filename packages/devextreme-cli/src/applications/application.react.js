const runCommand = require('../utility/run-command');
const path = require('path');
const fs = require('fs');
const getLayoutInfo = require('../utility/prompts/layout');
const getTemplateTypeInfo = require('../utility/prompts/typescript');
const getTranspilerTypeInfo = require('../utility/prompts/transpiler');
const templateCreator = require('../utility/template-creator');
const packageManager = require('../utility/package-manager');
const packageJsonUtils = require('../utility/package-json-utils');
const modifyJson = require('../utility/modify-json-file');
const insertItemToArray = require('../utility/file-content').insertItemToArray;
const moduleUtils = require('../utility/module');
const stringUtils = require('../utility/string');
const typescriptUtils = require('../utility/typescript-extension');
const removeFile = require('../utility/file-operations').remove;
const latestVersions = require('../utility/latest-versions');
const { extractDepsVersionTag } = require('../utility/extract-deps-version-tag');
const defaultStyles = [
    'devextreme/dist/css/dx.light.css'
];

const getExtension = (appPath) => {
    return fs.existsSync(path.join(appPath, 'src', 'App.tsx')) ? '.tsx' : '.jsx';
};

const pathToPagesIndex = () => {
    const extension = getExtension(process.cwd());
    return path.join(process.cwd(), 'src', 'pages', `index${extension}`);
};

const preparePackageJsonForTemplate = (appPath, appName) => {
    const dependencies = [
        { name: 'sass-embedded', version: '^1.85.1' },
        { name: 'devextreme-cli', version: latestVersions['devextreme-cli'], dev: true },
        { name: 'react-router-dom', version: '^6.3.0' },
    ];
    const scripts = [
        { name: 'build-themes', value: 'devextreme build' },
        { name: 'postinstall', value: 'npm run build-themes' }
    ];

    packageJsonUtils.addDependencies(appPath, dependencies);
    packageJsonUtils.updateScripts(appPath, scripts);
    packageJsonUtils.updateName(appPath, appName);
};

const updateJsonPropName = (path, name) => {
    modifyJson(path, content => {
        content.name = name;

        return content;
    });
};

const bumpReact = (appPath, versionTag, isTypeScript) => {
    const dependencies = [
        { name: 'react', version: versionTag },
        { name: 'react-dom', version: versionTag },
    ];

    if(isTypeScript) {
        dependencies.push(
            { name: '@types/react', version: versionTag, dev: true },
            { name: '@types/react-dom', version: versionTag, dev: true },
        );
    }

    packageJsonUtils.addDependencies(appPath, dependencies);
};

const create = async(appName, options) => {
    const templateType = await getTemplateTypeInfo(options.template);
    const transpiler = await getTranspilerTypeInfo(options.transpiler);
    const layoutType = await getLayoutInfo(options.layout);

    const templateOptions = Object.assign({}, options, {
        project: stringUtils.humanize(appName),
        layout: stringUtils.classify(layoutType),
        isTypeScript: typescriptUtils.isTypeScript(templateType)
    });
    const depsVersionTag = extractDepsVersionTag(options);

    const commandArguments = [`-p=create-vite@${depsVersionTag || latestVersions['create-vite']}`, 'create-vite', appName];

    commandArguments.push(`--template react${transpiler === 'swc' ? '-swc' : ''}${templateOptions.isTypeScript ? '-ts' : ''}`);

    await runCommand('npx', commandArguments);

    const appPath = path.join(process.cwd(), appName);

    modifyIndexHtml(appPath, templateOptions.project);

    if(depsVersionTag) {
        bumpReact(appPath, depsVersionTag, templateOptions.isTypeScript);
    }

    addTemplate(appPath, appName, templateOptions);
};

const modifyIndexHtml = (appPath, appName) => {
    const indexHtmlPath = path.join(appPath, 'index.html');

    let htmlContent = fs.readFileSync(indexHtmlPath).toString();
    htmlContent = htmlContent.replace(/<title>[^<]+<\/title>/, `<title>${appName}<\/title>`);
    htmlContent = htmlContent.replace('<body>', '<body class="dx-viewport">');

    fs.writeFileSync(indexHtmlPath, htmlContent);
};

const getCorrectPath = (extension, pathToApp, isTypeScript) => {
    return extension === '.ts' || extension === '.tsx' ? typescriptUtils.setFileExtension(pathToApp, isTypeScript) : pathToApp;
};

const addTemplate = (appPath, appName, templateOptions) => {
    const applicationTemplatePath = path.join(
        templateCreator.getTempaltePath('react'),
        'application'
    );

    const manifestPath = path.join(appPath, 'public', 'manifest.json');

    const styles = [
        './themes/generated/theme.additional.css',
        './themes/generated/theme.additional.dark.css',
        './themes/generated/theme.base.css',
        './themes/generated/theme.base.dark.css',
        'devextreme/dist/css/dx.common.css'
    ];

    templateCreator.moveTemplateFilesToProject(applicationTemplatePath, appPath, templateOptions, getCorrectPath);

    !templateOptions.isTypeScript && removeFile(path.join(appPath, 'src', 'types.jsx'));

    if(!templateOptions.empty) {
        addSamplePages(appPath, templateOptions);
    }

    preparePackageJsonForTemplate(appPath, appName, templateOptions.isTypeScript);
    updateJsonPropName(manifestPath, appName);
    install({}, appPath, styles);
};

const install = (options, appPath, styles) => {
    appPath = appPath ? appPath : process.cwd();

    const pathToMainComponent = path.join(appPath, 'src', `App${getExtension(appPath)}`);
    addStylesToApp(pathToMainComponent, styles || defaultStyles);
    packageJsonUtils.addDevextreme(appPath, options.dxversion, 'react');

    packageManager.runInstall({ cwd: appPath });
};

const addStylesToApp = (filePath, styles) => {
    styles.forEach(style => {
        moduleUtils.insertImport(filePath, style);
    });
};

const getComponentPageName = (viewName) => {
    return `${stringUtils.classify(viewName)}Page`;
};

const getNavigationData = (viewName, componentName, icon) => {
    const pagePath = stringUtils.dasherize(viewName);
    return {
        route: `\n  {\n    path: \'/${pagePath}\',\n    element: ${componentName}\n  }`,
        navigation: `\n  {\n    text: \'${stringUtils.humanize(viewName)}\',\n    path: \'/${pagePath}\',\n    icon: \'${icon}\'\n  }`
    };
};

const createPathToPage = (pageName) => {
    const pagesPath = path.join(process.cwd(), 'src', 'pages');
    const newPagePath = path.join(pagesPath, pageName);

    if(!fs.existsSync(pagesPath)) {
        fs.mkdirSync(pagesPath);
        fs.writeFileSync(pathToPagesIndex(), '');
    }

    if(!fs.existsSync(newPagePath)) {
        fs.mkdirSync(newPagePath);
    }

    return newPagePath;
};

const addSamplePages = (appPath, templateOptions) => {
    const samplePageTemplatePath = path.join(
        templateCreator.getTempaltePath('react'),
        'sample-pages'
    );

    const pagesPath = path.join(appPath, 'src', 'pages');
    fs.mkdirSync(pagesPath);
    templateCreator.moveTemplateFilesToProject(samplePageTemplatePath, pagesPath, {
        isTypeScript: templateOptions.isTypeScript
    }, getCorrectPath);
};

const addView = (pageName, options) => {
    const pageTemplatePath = path.join(
        templateCreator.getTempaltePath('react'),
        'page'
    );
    const extension = getExtension(process.cwd());

    const componentName = getComponentPageName(pageName);
    const pathToPage = createPathToPage(pageName);
    const routingModulePath = path.join(process.cwd(), 'src', `app-routes${extension}`);
    const navigationModulePath = path.join(process.cwd(), 'src', `app-navigation${extension}`);
    const navigationData = getNavigationData(pageName, componentName, options && options.icon || 'folder');

    const getCorrectExtension = (fileExtension) => {
        return fileExtension === '.tsx' ? extension : fileExtension;
    };
    templateCreator.addPageToApp(pageName, pathToPage, pageTemplatePath, getCorrectExtension);
    moduleUtils.insertExport(pathToPagesIndex(), componentName, `./${pageName}/${pageName}`, 'Page');
    moduleUtils.insertImport(routingModulePath, './pages', componentName);
    insertItemToArray(routingModulePath, navigationData.route);
    insertItemToArray(navigationModulePath, navigationData.navigation);
};

module.exports = {
    install,
    create,
    addTemplate,
    addView,
    updateJsonPropName,
    bumpReact,
    getCorrectPath,
    addStylesToApp,
    getComponentPageName,
};
