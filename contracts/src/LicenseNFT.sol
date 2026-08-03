// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";


interface IContentRegistry {
	struct Content{
		uint256 id;
        	address creator;
        	string title;
        	string metadataURI;
        	bytes32 contentHash;
        	uint256 price;
		bool active;
	}

	function getContent(
		uint256 contentId
	)
		external
		view
		returns(Content memory);
}


interface IRoyaltyManager {

    function distributeRoyalty(
        address payable creator
    )
        external
        payable;
}


/**
 * @title LicenseNFT
 * @notice Licencias digitales usando ERC-1155.
 */
contract LicenseNFT is ERC1155 {


    IContentRegistry public contentRegistry;

    IRoyaltyManager public royaltyManager;


    string public name =
        "Sauce Content License";


    string public symbol =
        "SAUCE-LICENSE";


    event LicensePurchased(
        address indexed buyer,
        uint256 indexed contentId,
        uint256 price
    );



    constructor(
        address _contentRegistry,
        address _royaltyManager
    )
        ERC1155("")
    {

        require(
            _contentRegistry != address(0),
            "Invalid content registry"
        );

        require(
            _royaltyManager != address(0),
            "Invalid royalty manager"
        );


        contentRegistry =
            IContentRegistry(
                _contentRegistry
            );


        royaltyManager =
            IRoyaltyManager(
                _royaltyManager
            );
    }



    /**
     * @notice Compra una licencia de contenido.
     */
    function buyLicense(
        uint256 contentId
    )
        external
        payable
    {

        IContentRegistry.Content memory content = 
		contentRegistry.getContent(
			contentId
		);
	address creator = content.creator;
	
	uint256 price = content.price;
	
	bool active = content.active;


        require(
            active,
            "Content inactive"
        );


        require(
            msg.value >= price,
            "Insufficient payment"
        );



        royaltyManager.distributeRoyalty{
            value: msg.value
        }(
            payable(creator)
        );



        _mint(
            msg.sender,
            contentId,
            1,
            ""
        );


        emit LicensePurchased(
            msg.sender,
            contentId,
            price
        );
    }



    /**
     * @notice Verifica si un usuario tiene licencia.
     */
    function hasLicense(
        address user,
        uint256 contentId
    )
        external
        view
        returns(bool)
    {

        return balanceOf(
            user,
            contentId
        ) > 0;
    }

}
