// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title RoyaltyManager
 * @notice Gestiona distribución de pagos a creadores.
 */
contract RoyaltyManager {

    uint256 public constant CREATOR_PERCENT = 95;
    uint256 public constant PLATFORM_PERCENT = 5;

    address public platform;


    event RoyaltyPaid(
        address indexed creator,
        uint256 creatorAmount,
        uint256 platformAmount
    );


    constructor(address _platform) {

        require(
            _platform != address(0),
            "Invalid platform"
        );

        platform = _platform;
    }


    /**
     * @notice Distribuye el pago de una licencia.
     */
    function distributeRoyalty(
        address payable creator
    )
        external
        payable
    {

        require(
            creator != address(0),
            "Invalid creator"
        );

        require(
            msg.value > 0,
            "No payment"
        );


        uint256 creatorAmount =
            (msg.value * CREATOR_PERCENT) / 100;


        uint256 platformAmount =
            msg.value - creatorAmount;


        (bool creatorSuccess,) =
            creator.call{
                value: creatorAmount
            }("");

        require(
            creatorSuccess,
            "Creator payment failed"
        );


        (bool platformSuccess,) =
            payable(platform).call{
                value: platformAmount
            }("");

        require(
            platformSuccess,
            "Platform payment failed"
        );


        emit RoyaltyPaid(
            creator,
            creatorAmount,
            platformAmount
        );
    }


    /**
     * @notice Permite consultar porcentajes.
     */
    function getRoyaltyInfo()
        external
        pure
        returns(
            uint256 creatorPercent,
            uint256 platformPercent
        )
    {
        return (
            CREATOR_PERCENT,
            PLATFORM_PERCENT
        );
    }
}