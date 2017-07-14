/* @flow */
import Path from './history-path'
import localStorage from './storage'
import { _history } from './history'

const Time = window.performance && window.performance.now
    ? window.performance
    : Date

function genKey() {
    return Time.now().toFixed(3)
}

export default class RouterStorage {

}

RouterStorage.install = function (Vue, option) {
    if (this.isInstall) {
        if (process.env.NODE_ENV == 'development')
            console.log('[router-storage]:has been installed')
        return;
    }
    this.isInstall = true;

    localStorage.Resolve()

    Object.defineProperty(Vue.prototype, '$history', {
        get() { return _history }
    })

    Vue.mixin({
        created() {
            var vm = this.$root;

            if (_history.enterPath != '') return;

            if (!vm.$router || !vm.$route) {
                if (process.env.NODE_ENV == 'development')
                    console.warn('[router-storage]:Please used VueRouter first.')
                return;
            }

            //获取基路径            
            _history.base = vm.$router.options.base ? '/' + vm.$router.options.base : '';
            //先获得访问vue页面时的路径
            _history.enterPath = location.pathname.replace(_history.base, '') + location.search;
            if (process.env.NODE_ENV == 'development')
                console.log('[router-storage]:enterPath：' + _history.enterPath + ' base:' + _history.base)
            if (_history.enterPath == '/') {
                localStorage.Clear();
            }

            //刷新时，在根路径前多加一个记录，防止退后时跳出Vue，无法再执行判断和禁止后退操作
            if (history.length > 1) {
                history.replaceState({ key: -1 }, '', _history.base + '/__root');
                history.pushState({ key: genKey() }, '', _history.base + '/');
            }
            //有历史记录
            if (_history.routes.length > 0) {
                for (var idx = 0; idx < _history.routes.length; idx++) {
                    history.pushState({ key: genKey() }, '', _history.base + _history.routes[idx]);
                }

                //进来时的路径与保存的历史记录中的最后一个不相同,追加
                if (_history.routes[_history.routes.length - 1] !== _history.enterPath) {
                    _history.routes.push(_history.enterPath);
                    history.pushState({ key: genKey() }, '', _history.base + _history.enterPath);
                }
                localStorage.Save();
            }
            else if (_history.enterPath !== '' && _history.enterPath !== '/') {
                if (process.env.NODE_ENV == 'development')
                    console.log('[router-storage]:resolve routers from routeMatched')
                for (var idx = 0; idx < vm.$route.matched.length - 1; idx++) {
                    var path = vm.$route.matched[idx].path;
                    history.pushState({ key: genKey() }, '', _history.base + path);
                    _history.routes.push(path);
                }
                history.pushState({ key: genKey() }, '', _history.base + _history.enterPath);
                _history.routes.push(_history.enterPath);
                localStorage.Save();
            }
            _history.beforeState = history.state;
            _history.length = history.length;

            //用于标记是否已经被路由处理过，路由处理过popstate事件就不再处理了
            var _routeActived = false;
            //用于标记是否已到达Vue根路径，到达就不再后退了
            var _isRoot = false;
            //有重复的标记
            var findRepeat = false;

            /*下面三个方法一定是要在Vue路由改变（即调用了next()）之后调用，因为下面的 vm.$route.fullPath 对应to.fullPath*/
            let goBack = () => {
                if (findRepeat)
                    return;

                if (_history.routes.length > 0)
                    _history.forwardRoutes.push(_history.routes.pop());

                console.log(_history.forwardRoutes);

                if (process.env.NODE_ENV == 'development')
                    console.log('[router-storage]:go back')

                vm.$emit('history.goback')
            }

            let replace = () => {
                if (findRepeat)
                    return;


                //检查当前路径是否与上一个路径相同，相同则去重
                if (vm.$route.fullPath == _history.routes[_history.routes.length - 2]) {
                    findRepeat = true;
                    history.go(-1);
                    _history.routes.pop();
                    findRepeat = false;
                }
                else {

                    _history.routes.pop();
                    _history.routes.push(vm.$route.fullPath);

                }

                if (process.env.NODE_ENV == 'development')
                    console.log('[router-storage]:router replace :' + vm.$route.fullPath)

                vm.$emit('history.replace')
            }

            let goForward = () => {
                if (findRepeat)
                    return;

                if (process.env.NODE_ENV == 'development')
                    console.log('[router-storage]:go forward')
                //前进
                _history.routes.push(vm.$route.fullPath);
                _history.forwardRoutes = [];

                vm.$emit('history.goforward')
            }

            vm.$router.beforeEach((to, from, next) => {
                _routeActived = true;
                _isRoot = false;

                //在Vue根目录再后退的处理
                if (to.path == '/__root' && history.state && history.state.key === -1) {
                    if (process.env.NODE_ENV == 'development')
                        console.warn('[router-storage]:It\'s root,can\'t back!')
                    _isRoot = true;
                    vm.$emit('history.inroot')

                    next(false);
                    _history.beforeState = { key: genKey() }
                    for (var idx = _history.forwardRoutes.length - 1; idx >= 0; idx--) {
                        history.pushState({ key: genKey() }, '', _history.base + _history.forwardRoutes[idx])
                    }
                    history.go(-1 * _history.forwardRoutes.length)
                }
                else {
                    next();

                    if (to.path == '/'
                        || history.state
                        && _history.beforeState
                        && history.state.key
                        && Number(_history.beforeState.key) > Number(history.state.key)) {
                        //普通后退处理
                        goBack();
                    }
                    else {
                        //replace处理
                        if (_history.beforeState && history.state && _history.beforeState.key == history.state.key) {
                            replace();
                        }
                        //普通前进处理
                        else {
                            goForward();
                        }
                    }
                    _history.beforeState = history.state;
                    localStorage.Save()
                }
            })

            //to和form的路由相同时，不会触发beforeEach，此时监听浏览器onpopstate事件进行补偿
            window.onpopstate = function (e) {

                console.log('onpopstate', e)

                //如果路由处理过，则不再执行
                if (_routeActived) {
                    _routeActived = false;
                    return;
                }

                if (!_isRoot && !findRepeat) {
                    if (_history.beforeState && e.state && Number(_history.beforeState.key) > Number(e.state.key)) {
                        if (process.env.NODE_ENV == 'development')
                            console.log('[router-storage]:additional go back');
                        goBack();
                    }
                    else if (Number(_history.beforeState.key) != Number(e.state.key)) {
                        if (process.env.NODE_ENV == 'development')
                            console.log('[router-storage]:additional go forward');
                        goForward();
                    }
                    _history.beforeState = history.state;
                    localStorage.Save()
                }
            }

            //路由调用完后初始化_routeActived
            // vm.$router.afterEach(route => {
            //     _routeActived = false;
            // })
        }
    })

    Vue.component('history-path', Path)
}

if (window.Vue) {
    window.Vue.use(RouterStorage)
}
