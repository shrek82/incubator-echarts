// TODO Area
// TODO Null data
define(function(require) {

    'use strict';

    var zrUtil = require('zrender/core/util');
    var vector = require('zrender/core/vector');
    var DataSymbol = require('../helper/DataSymbol');
    var lineAnimationDiff = require('./lineAnimationDiff');

    function isPointsSame(points1, points2) {
        if (points1.length !== points2.length) {
            return;
        }
        for (var i = 0; i < points1.length; i++) {
            var p1 = points1[i].point;
            var p2 = points2[i].point;
            if (p1[0] !== p2[0] || p1[1] !== p2[1]) {
                return;
            }
        }
        return true;
    }

    return require('../../echarts').extendChartView({

        type: 'line',

        init: function () {
            this._dataSymbol = new DataSymbol();
            this.group.add(this._dataSymbol.group);
        },

        render: function (seriesModel, ecModel, api) {
            var group = this.group;
            var data = seriesModel.getData();
            var lineStyleNormalModel = seriesModel.getModel('itemStyle.normal.lineStyle');

            var points = data.map(data.getItemLayout, true);
            var plainDataList = data.map(['x', 'y'], function (x, y, idx) {
                return {
                    x: x,
                    y: y,
                    point: points[idx],
                    name: data.getName(idx),
                    idx: idx,
                    rawIdx: data.getRawIndex(idx)
                };
            });

            var prevCoordSys = this._coordSys
            var coordSys = seriesModel.coordinateSystem;
            var isCoordSysPolar = coordSys.type === 'polar';

            // FIXME Update after animation
            // if (
            //     isCoordSysPolar
            //     && points.length > 2
            //     && coordinateSystem.getAngleAxis().type === 'category'
            // ) {
            //     // Close polyline
            //     points.push(Array.prototype.slice.call(points[0]));
            // }

            // Draw symbols, enable animation on the first draw
            var dataSymbol = this._dataSymbol;
            dataSymbol.z = seriesModel.get('z') + 1;

            // Initialization animation or coordinate system changed
            if (!this._data || prevCoordSys.type !== coordSys.type) {
                dataSymbol.updateData(data, false);

                var polyline = new api.Polyline({
                    shape: {
                        points: points
                    },
                    style: zrUtil.extend(
                        lineStyleNormalModel.getLineStyle(),
                        {
                            stroke: data.getVisual('color'),
                            lineJoin: 'bevel'
                        }
                    )
                });

                // var removeClipPath = zrUtil.bind(polyline.removeClipPath, polyline);

                var clipPath = isCoordSysPolar
                    ? this._createPolarClipShape(coordSys, api)
                    : this._createGridClipShape(coordSys, api);

                polyline.setClipPath(clipPath);

                group.add(polyline);

                this._polyline = polyline;
            }
            else {
                dataSymbol.updateData(data, false);
                // In the case data zoom triggerred refreshing frequently
                // Data may not change if line has a category axis. So it should animate nothing
                if (!isPointsSame(this._plainDataList, plainDataList)) {
                    this._updateAnimation(
                        data, plainDataList, coordSys
                    );
                }
                // Add back
                group.add(this._polyline);
            }

            this._data = data;

            this._plainDataList = plainDataList;
            this._coordSys = coordSys;
        },

        _updateAnimation: function (data, plainDataList, coordSys) {
            var polyline = this._polyline;
            var diff = lineAnimationDiff(
                this._plainDataList, plainDataList, this._coordSys, coordSys
            );
            polyline.shape.points = diff.current;
            polyline.animateTo({
                shape: {
                    points: diff.next
                }
            }, 300, 'cubicOut');

            var updatedDataInfo = [];
            var addedDataIndices = [];
            var diffStatus = diff.status;

            for (var i = 0; i < diffStatus.length; i++) {
                var cmd = diffStatus[i].cmd;
                if (cmd === '=') {
                    updatedDataInfo.push({
                        el: data.getItemGraphicEl(diffStatus[i].idx1),
                        ptIdx: i    // Index of points
                    });
                }
                else if (cmd === '+') {
                    addedDataIndices.push(diffStatus[i].idx);
                }
            }

            if (polyline.animators) {
                for (var i = 0; i < addedDataIndices.length; i++) {
                    var el = data.getItemGraphicEl(addedDataIndices[i]);
                    var oldScale = el.scale;
                    el.scale = [1, 1];
                    el.animateTo({
                        scale: oldScale
                    }, 300, 300, 'cubicOut');
                }
                polyline.animators[0].during(function () {
                    for (var i = 0; i < updatedDataInfo.length; i++) {
                        var el = updatedDataInfo[i].el;
                        vector.copy(
                            el.position,
                            // synchronizing with the point on line
                            polyline.shape.points[updatedDataInfo[i].ptIdx]
                        );
                        el.dirty();
                    }
                });
            }
        },

        _createGridClipShape: function (cartesian, api, cb) {
            var xAxis = cartesian.getAxis('x');
            var yAxis = cartesian.getAxis('y');
            var xExtent = xAxis.getExtent();
            var yExtent = yAxis.getExtent();

            var clipPath = new api.Rect({
                shape: {
                    x: xExtent[0],
                    y: yExtent[0],
                    width: 0,
                    height: yExtent[1] - yExtent[0]
                }
            });

            clipPath.animateTo({
                shape: {
                    x: xExtent[0],
                    y: yExtent[0],
                    width: xExtent[1] - xExtent[0],
                    height: yExtent[1] - yExtent[0]
                }
            }, 1500, cb);

            return clipPath;
        },

        _createPolarClipShape: function (polar, api, cb) {
            // var angleAxis = polar.getAngleAxis();
            var radiusAxis = polar.getRadiusAxis();

            var radiusExtent = radiusAxis.getExtent();

            var clipPath = new api.Sector({
                shape: {
                    cx: polar.cx,
                    cy: polar.cy,
                    r0: radiusExtent[0],
                    r: radiusExtent[1],
                    startAngle: 0,
                    endAngle: 0
                }
            });

            clipPath.animateTo({
                shape: {
                    endAngle: Math.PI * 2
                }
            }, 1500, cb);

            return clipPath;
        },

        remove: function () {
            this.group.remove(this._polyline);
            this._dataSymbol.remove(true);
        }
    });
});