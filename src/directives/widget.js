
var skipArray = require('../vmodel/parts/skipArray')
var fireDisposeHook = require('../component/fireDisposeHook')

//插入点机制,组件的模板中有一些ms-slot元素,用于等待被外面的元素替代
function wrap(str) {
    return str.replace('return __value__', function (a) {
        var prefix = 'if(Array.isArray(__value__)){\n' +
                '    __value__ = avalon.mix.apply({},__value__)\n' +
                '}\n'
        return prefix + a
    })
}

avalon.directive('widget', {
    parse: function (binding, num, elem) {
        var wid = elem.props.wid = avalon.makeHashCode('w')
        avalon.resolvedComponents[wid] = {
            props: avalon.shadowCopy({wid: wid}, elem.props),
            template: elem.template
        }
        return  'vnode' + num + '.props.wid = "' + wid + '"\n' +
                'vnode' + num + '.props["ms-widget"] = ' + wrap(avalon.parseExpr(binding), 'widget') + ';\n' +
                '\tvnode' + num + ' = avalon.component(vnode' + num + ', __vmodel__)\n'
    },
    define: function (topVm, defaults, options) {
        var after = avalon.mix({}, defaults, options)
        var events = {}
        //绑定生命周期的回调
        'onInit onReady onViewChange onDispose'.replace(/\S+/g, function (a) {
            if (typeof after[a] === 'function')
                events[a] = after[a]
            delete after[a]
        })
        var vm = avalon.mediatorFactory(topVm, defaults)
        vm = avalon.mediatorFactory(vm, options)
        ++avalon.suspendUpdate
        for (var i in after) {
            if (skipArray[i])
                continue
            vm[i] = after[i]
        }
        --avalon.suspendUpdate
        for (i in events) {
            vm.$watch(i, events[i])
        }
        return vm
    },
    diff: function (cur, pre) {
        var coms = avalon.resolvedComponents
        var wid = cur.props.wid

        var docker = coms[wid]
        if (!docker.renderCount) {
            cur.change = [this.replaceByComment]
        } else if (docker.renderCount === 1) {
            avalon.diff(cur.children, [])
            cur.change = [this.replaceByComponent]
            cur.afterChange = [
                function (dom, vnode) {
                    vnode.vmodel.$element = dom
                    cur.vmodel.$fire('onReady', {
                        type: 'ready',
                        target: dom,
                        vmodel: vnode.vmodel
                    })
                    docker.renderCount = 2
                }
            ]
        } else {
            var needUpdate = !cur.$diff || cur.$diff(cur, pre)
            cur.skipContent = !needUpdate
            var viewChangeObservers = cur.vmodel.$events.onViewChange
            if (viewChangeObservers && viewChangeObservers.length) {
                cur.afterChange = [function (dom, vnode) {
                        var preHTML = avalon.vdomAdaptor(pre, 'toHTML')
                        var curHTML = avalon.vdomAdaptor(cur, 'toHTML')
                        if (preHTML !== curHTML) {
                            cur.vmodel.$fire('onViewChange', {
                                type: 'viewchange',
                                target: dom,
                                vmodel: vnode.vmodel
                            })
                        }
                        docker.renderCount++
                    }]
            }
        }
    },
    addDisposeWatcher: function (dom) {
        if (window.chrome) {
            dom.addEventListener("DOMNodeRemovedFromDocument", function () {
                avalon.fireDisposedComponents = avalon.noop
                setTimeout(function () {
                    fireDisposeHook(dom)
                })
            })
        }
    },
    replaceByComment: function (dom, node, parent) {
        var comment = document.createComment(node.nodeValue)
        if (dom) {
            parent.replaceChild(comment, dom)
        } else {
            parent.appendChild(comment)
        }
    },
    replaceByComponent: function (dom, node, parent) {
        var com = avalon.vdomAdaptor(node, 'toDOM')
        if (dom) {
            parent.replaceChild(com, dom)
        } else {
            parent.appendChild(com)
        }
        avalon.directives.widget.addDisposeWatcher(com)
    }
})


// http://www.besteric.com/2014/11/16/build-blog-mirror-site-on-gitcafe/